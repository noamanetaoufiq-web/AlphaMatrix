#!/usr/bin/env python3
"""
Pre-release evidence for the big US releases, from real public data (FRED CSV, key-less).
Writes into context.json:   "lead": {"<event name>": -1|0|1}   and   "lead_notes": [...]
 +1 = the data BEFORE the release points to an ABOVE-forecast print (hot), -1 = BELOW (soft).
The site feeds this into its scenario model (it only moves the odds a little; no signal = 0).

Rules of thumb (NOT backtested, kept on purpose simple and explained in lead_notes):
  CPI m/m     : gasoline price of the reference month vs the month before (EIA weekly, FRED GASREGW)
  PPI m/m     : average of gasoline and WTI crude monthly change (FRED GASREGW, DCOILWTICO)
  Non-Farm    : jobless claims trend (FRED ICSA) and ADP vs the NFP forecast (FRED ADPMNUSNERSA)
  Core CPI / Core PPI / FOMC: no free leading data here -> no override (the site keeps its default)
Each source is optional: if FRED or one series fails the script just skips it.
Run AFTER fetch_context.py (it adds to the file that script writes). Python stdlib only.
"""
import csv
import datetime as dt
import io
import json
import sys
import time
import urllib.request

CONTEXT = "context.json"
NEWS = "news.json"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id="


def series(sid, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(
                FRED + sid + "&cosd=2025-01-01",
                headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept": "text/csv,*/*"},
            )
            with urllib.request.urlopen(req, timeout=40) as r:
                rows = list(csv.reader(io.StringIO(r.read().decode("utf-8"))))
            break
        except Exception as e:  # retry: FRED sometimes resets connections from CI machines
            last = e
            time.sleep(3 * (i + 1))
    else:
        raise last
    out = []
    for row in rows[1:]:
        if len(row) < 2 or row[1] in ("", "."):
            continue
        try:
            out.append((dt.date.fromisoformat(row[0]), float(row[1])))
        except Exception:
            pass
    return out


def month_avg(obs, y, m):
    v = [x for d, x in obs if d.year == y and d.month == m]
    return sum(v) / len(v) if v else None


def prev_month(y, m, k=1):
    m -= k
    while m < 1:
        m += 12
        y -= 1
    return y, m


def pct_change(obs, ref):
    a, b = month_avg(obs, *ref), month_avg(obs, *prev_month(*ref))
    return None if not a or not b else (a / b - 1) * 100


def sign(x, hi):
    return 0 if x is None else (1 if x >= hi else -1 if x <= -hi else 0)


def next_event(news, title, now):
    c = []
    for it in news:
        if it.get("title") == title and not (it.get("actual") or "").strip():
            try:
                t = dt.datetime.fromisoformat(it["date"])
            except Exception:
                continue
            if t >= now - dt.timedelta(hours=1):
                c.append((t, it))
    return min(c, key=lambda x: x[0]) if c else (None, None)


def build(news, now, get=series):
    lead, notes, dbg = {}, [], []

    def safe(sid):
        try:
            r = get(sid)
            dbg.append("%s: %d obs, last %s" % (sid, len(r), r[-1][0].isoformat() if r else "-"))
            return r
        except Exception as e:
            print("warning: FRED %s failed: %s" % (sid, e), file=sys.stderr)
            dbg.append("%s: FAILED %s" % (sid, str(e)[:120]))
            return None

    gas = oil = claims = adp = None
    loaded = False

    def load():
        nonlocal gas, oil, claims, adp, loaded
        if not loaded:
            gas, oil, claims, adp = safe("GASREGW"), safe("DCOILWTICO"), safe("ICSA"), safe("ADPMNUSNERSA")
            loaded = True

    for title, name in (("CPI m/m", "CPI m/m"), ("PPI m/m", "PPI m/m"), ("Non-Farm Employment Change", "Non-Farm Payrolls")):
        t, it = next_event(news, title, now)
        if not t:
            continue
        load()
        ref = prev_month(t.year, t.month)  # the release is about the month before the release date
        tag = "%d-%02d" % ref
        dbg.append("event %s on %s -> reference month %s" % (name, t.date().isoformat(), tag))
        if name == "CPI m/m" and gas:
            g = pct_change(gas, ref)
            if g is not None:
                lead[name] = sign(g, 3.0)
                notes.append("CPI m/m (%s): gasoline %+.1f%% vs previous month -> %s" % (tag, g, {1: "hot", -1: "soft", 0: "neutral"}[lead[name]]))
        elif name == "PPI m/m":
            parts = []
            for lab, ob, hi in (("gasoline", gas, 3.0), ("WTI crude", oil, 6.0)):
                x = pct_change(ob, ref) if ob else None
                if x is not None:
                    parts.append((lab, x, sign(x, hi)))
            if parts:
                tot = sum(p[2] for p in parts) / len(parts)
                lead[name] = 1 if tot > 0.25 else -1 if tot < -0.25 else 0
                notes.append("PPI m/m (%s): " % tag + ", ".join("%s %+.1f%%" % (p[0], p[1]) for p in parts) + " -> %s" % {1: "hot", -1: "soft", 0: "neutral"}[lead[name]])
        elif name == "Non-Farm Payrolls":
            sig, txt = [], []
            if claims:
                c = pct_change(claims, ref)
                if c is not None:
                    sig.append(-sign(c, 5.0))  # claims rising = weaker jobs
                    txt.append("jobless claims %+.1f%% (month avg)" % c)
            if adp:
                a = [x for d, x in adp if (d.year, d.month) == ref]
                p = [x for d, x in adp if (d.year, d.month) == prev_month(*ref)]
                try:
                    fc = float("".join(ch for ch in (it.get("forecast") or "") if ch in "0123456789.-"))
                except Exception:
                    fc = None
                if a and p and fc is not None:
                    chg = a[-1] - p[-1]
                    sig.append(1 if chg >= fc + 30 else -1 if chg <= fc - 30 else 0)
                    txt.append("ADP %+.0fK vs NFP forecast %.0fK" % (chg, fc))
            if sig:
                tot = sum(sig) / len(sig)
                lead[name] = 1 if tot > 0.25 else -1 if tot < -0.25 else 0
                notes.append("NFP (%s): " % tag + ", ".join(txt) + " -> %s" % {1: "hot", -1: "soft", 0: "neutral"}[lead[name]])
    if not lead:
        dbg.append("no evidence produced (missing data for the reference month, or no mapped event ahead)")
    return lead, notes, dbg


def main(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        ctx = json.load(open(CONTEXT, encoding="utf-8"))
    except Exception as e:
        print("no context.json yet:", e)
        return 0
    try:
        news = json.load(open(NEWS, encoding="utf-8"))
    except Exception:
        news = []
    lead, notes, dbg = build(news, now)
    ctx["lead"] = lead
    ctx["lead_notes"] = notes
    ctx["lead_debug"] = dbg  # why there is (no) evidence; readable in context.json
    with open(CONTEXT, "w", encoding="utf-8") as f:
        json.dump(ctx, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("lead:", lead)
    for n in notes + dbg:
        print(" -", n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
