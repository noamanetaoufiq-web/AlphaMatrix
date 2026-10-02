#!/usr/bin/env python3
"""
Builds context.json: the "market context" inputs of the news scenario model,
computed automatically (no manual clicking). Run hourly by
.github/workflows/update-calendar.yml, next to fetch_calendar.py.

  f_trend : gold short-term trend        (Yahoo GC=F, price vs 20d average + 5d move)
  f_usd   : USD & yields                 (Yahoo DX-Y.NYB + ^TNX, ~10 trading-day change)
  f_gs    : gold seasonality, this month (Yahoo GC=F monthly history, last 15 years)
  f_lead  : leading data ADP/ISM/JOLTS/claims (actual vs forecast, public calendar feed,
            remembered for 30 days)
Values are -1 / 0 / +1 (same meaning as the buttons on the News page).
f_season (seasonality of the *release itself*, e.g. NFP) has no free data source,
so it stays a manual button.

Every source is wrapped: if one fails, the previous value is kept.
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

OUT = "context.json"
UA = {"User-Agent": "Mozilla/5.0"}
CAL = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json",
       "https://nfs.faireconomy.media/ff_calendar_lastweek.json"]
LEAD_KEYS = ("ADP", "ISM", "JOLTS", "Unemployment Claims")


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def yahoo(sym, rng, interval):
    j = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range={rng}&interval={interval}")
    r = j["chart"]["result"][0]
    cl = r["indicators"]["quote"][0]["close"]
    return [(t, c) for t, c in zip(r["timestamp"], cl) if c is not None]


def word(v, pos, neg):
    return pos if v > 0 else neg if v < 0 else "neutral"


def gold_trend():
    c = [x[1] for x in yahoo("GC=F", "3mo", "1d")]
    last, sma, chg = c[-1], sum(c[-20:]) / 20, c[-1] / c[-6] - 1
    v = 1 if last > sma and chg > 0 else -1 if last < sma and chg < 0 else 0
    return v, f"Gold {last:,.0f} vs 20d avg {sma:,.0f}, 5d {chg:+.1%} -> trend {word(v, 'bullish', 'bearish')}"


def usd_yields():
    d = [x[1] for x in yahoo("DX-Y.NYB", "1mo", "1d")]
    y = [x[1] for x in yahoo("%5ETNX", "1mo", "1d")]
    uc, yc = d[-1] / d[-11] - 1, y[-1] - y[-11]
    u = 1 if uc > 0.005 else -1 if uc < -0.005 else 0
    yv = 1 if yc > 0.10 else -1 if yc < -0.10 else 0
    s = u + yv
    v = 1 if s >= 1 else -1 if s <= -1 else 0
    return v, f"DXY {d[-1]:.2f} ({uc:+.1%} 10d), US10Y {y[-1]:.2f}% ({yc:+.2f} 10d) -> {word(v, 'strong', 'weak')}"


def gold_season():
    pts = yahoo("GC=F", "max", "1mo")
    m = dt.datetime.utcnow().month
    rets = []
    for i in range(1, len(pts)):
        d = dt.datetime.utcfromtimestamp(pts[i][0])
        if d.month == m and (d.year, d.month) != (dt.datetime.utcnow().year, dt.datetime.utcnow().month):
            rets.append(pts[i][1] / pts[i - 1][1] - 1)
    rets = rets[-15:]
    avg, pos = sum(rets) / len(rets), sum(1 for r in rets if r > 0) / len(rets)
    v = 1 if pos >= 0.6 and avg > 0 else -1 if pos <= 0.4 and avg < 0 else 0
    name = dt.date(2000, m, 1).strftime("%B")
    return v, f"Gold in {name}: avg {avg:+.1%}, up {pos:.0%} of the last {len(rets)} years -> {word(v, 'strong', 'weak')}"


def num(s):
    s = re.sub(r"[,%KMBT]", "", str(s or "")).strip()
    try:
        return float(s)
    except ValueError:
        return None


def leading(prev_hist):
    hist = {(h["title"], h["date"][:10]): h for h in prev_hist}
    ok = False
    for url in CAL:
        try:
            items = get(url)
        except Exception as e:
            print(f"warning: {url}: {e}", file=sys.stderr)
            continue
        ok = True
        for it in items:
            if it.get("country") != "USD" or not any(k in it.get("title", "") for k in LEAD_KEYS):
                continue
            a, f = num(it.get("actual")), num(it.get("forecast"))
            if a is None or f is None:
                continue
            sign = (a > f) - (a < f)
            if "Claims" in it["title"]:
                sign = -sign  # higher claims = weaker labour market
            hist[(it["title"], it["date"][:10])] = {"title": it["title"], "date": it["date"], "actual": a, "forecast": f, "sign": sign}
    if not ok:
        raise RuntimeError("calendar feeds unavailable")
    cut = (dt.datetime.utcnow() - dt.timedelta(days=30)).strftime("%Y-%m-%d")
    h = sorted((x for k, x in hist.items() if k[1] >= cut), key=lambda x: x["date"])
    s = sum(x["sign"] for x in h)
    v = 1 if s > 0 else -1 if s < 0 else 0
    last = ", ".join(f"{x['title'].split()[0]} {'beat' if x['sign'] > 0 else 'miss' if x['sign'] < 0 else 'in line'}" for x in h[-4:]) or "no releases yet"
    return v, f"Leading data (30d): {last} -> {word(v, 'hot', 'soft')}", h


def main():
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}
    res, notes, hist, okc = {}, [], old.get("lead_hist", []), 0
    for key, fn in (("f_trend", gold_trend), ("f_usd", usd_yields), ("f_gs", gold_season), ("f_lead", lambda: leading(hist))):
        try:
            out = fn()
            res[key] = out[0]
            notes.append(out[1])
            if key == "f_lead":
                hist = out[2]
            okc += 1
        except Exception as e:
            print(f"warning: {key} failed: {e}", file=sys.stderr)
            res[key] = old.get(key, 0)
            notes.append(f"{key}: source unavailable, kept previous value")
    if okc == 0 and not old:
        print("error: all sources failed", file=sys.stderr)
        sys.exit(1)
    data = {"updated": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), **res, "notes": notes, "lead_hist": hist}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", OUT, {k: res[k] for k in res})


if __name__ == "__main__":
    main()
