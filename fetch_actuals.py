#!/usr/bin/env python3
"""
Fetches the REAL printed value (ACTUAL) of high-impact US releases straight from the
official source (BLS public API) right after the release, and writes it into news.json.

Why: the public calendar feed (nfs.faireconomy.media) never carries the actual value,
so the site stayed on its "pre-release" lean after the news was out. With this script the
site switches to the AFTER-RELEASE decision by itself, a few minutes after the print.

Runs every 5 minutes on weekdays (.github/workflows/news-actuals.yml). It does nothing
(and does not call BLS) unless a mapped release is due and still has no actual.
Optional secret BLS_API_KEY (free, https://data.bls.gov/registrationEngine/) raises the BLS limit
from 25 to 500 requests/day; without it the script still works (it only calls BLS when a release is due).
Python stdlib only.
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

NEWS = "news.json"
STORE = "actuals.json"
BLS_V1 = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
BLS_V2 = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
MAX_AGE_H = 36

# title regex -> (kind, series id)
#   mm  = month-over-month % (seasonally adjusted index)      -> "0.3%"
#   yy  = year-over-year % (not seasonally adjusted index)    -> "3.1%"
#   dk  = monthly change of a level, in thousands             -> "142K"
#   lvl = the level itself in %                               -> "4.1%"
MAP = [
    (r"^Core CPI m/m$", "mm", "CUSR0000SA0L1E"),
    (r"^CPI m/m$", "mm", "CUSR0000SA0"),
    (r"^CPI y/y$", "yy", "CUUR0000SA0"),
    (r"^Core PPI m/m$", "mm", "WPSFD4131"),
    (r"^PPI m/m$", "mm", "WPSFD4"),
    (r"^Non-?Farm Employment Change$", "dk", "CES0000000001"),
    (r"^Unemployment Rate$", "lvl", "LNS14000000"),
    (r"^Average Hourly Earnings m/m$", "mm", "CES0500000003"),
    (r"^Federal Funds Rate$", "fomc", None),   # read from the Fed's own statement (federalreserve.gov), not from BLS
]


def match(title):
    t = (title or "").strip()
    for rx, kind, sid in MAP:
        if re.match(rx, t, re.I):
            return kind, sid
    return None


def parse_dt(s):
    try:
        return dt.datetime.fromisoformat(s)
    except Exception:
        return None


def bls(series_ids, year):
    key = os.environ.get("BLS_API_KEY", "").strip()
    body = {"seriesid": sorted(series_ids), "startyear": str(year - 2), "endyear": str(year)}
    url = BLS_V1
    if key:
        body["registrationkey"] = key
        url = BLS_V2
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        j = json.loads(r.read().decode("utf-8"))
    if j.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError("BLS: %s" % j.get("message"))
    out = {}
    for s in j["Results"]["series"]:
        d = {}
        for p in s.get("data", []):
            m = re.match(r"^M(\d\d)$", p.get("period", ""))
            if not m or m.group(1) == "13":
                continue
            try:
                d[(int(p["year"]), int(m.group(1)))] = float(p["value"])
            except Exception:
                pass
        out[s["seriesID"]] = d
    return out


def fred(series_ids):
    """Fallback source: FRED carries the same BLS series ids (updated some minutes to hours after the release)."""
    import csv
    import io

    out = {}
    for sid in sorted(series_ids):
        try:
            txt = _http("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=2024-01-01" % sid)
        except Exception as e:
            ERR["fred"] = "%s: %s" % (sid, str(e)[:100])
            continue
        d = {}
        for row in list(csv.reader(io.StringIO(txt)))[1:]:
            try:
                y, m = int(row[0][:4]), int(row[0][5:7])
                d[(y, m)] = float(row[1])
            except Exception:
                pass
        out[sid] = d
    return out


ERR = {}


def prev_month(y, m, k=1):
    m -= k
    while m < 1:
        m += 12
        y -= 1
    return y, m


FED_FEED = "https://www.federalreserve.gov/feeds/press_monetary.xml"


def _http(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def _frac(x):
    """'4-1/4' -> 4.25, '5' -> 5.0, '1/4' -> 0.25"""
    x = x.strip()
    m = re.match(r"^(\d+)-(\d)/(\d)$", x)
    if m:
        return int(m.group(1)) + int(m.group(2)) / int(m.group(3))
    m = re.match(r"^(\d)/(\d)$", x)
    if m:
        return int(m.group(1)) / int(m.group(2))
    return float(x)


def parse_fomc_text(text):
    """Upper bound of the target range from the FOMC statement, e.g. '4-1/4 to 4-1/2 percent' -> '4.50%'."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    for sent in re.split(r"(?<=[.])\s", text):
        if "target range for the federal funds rate" not in sent:
            continue
        m = re.search(r"(\d+(?:-\d/\d)?|\d/\d)\s+to\s+(\d+(?:-\d/\d)?|\d/\d)\s+percent", sent)
        if m:
            return "%.2f%%" % _frac(m.group(2))
    return None


def fomc_actual(t):
    """Find the FOMC statement published on the event day and read the new target range."""
    import xml.etree.ElementTree as ET

    root = ET.fromstring(_http(FED_FEED))
    day = t.astimezone(dt.timezone(dt.timedelta(hours=-5))).date()  # statement is 2pm New York time
    for item in root.iter("item"):
        title = (item.findtext("title") or "")
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate") or ""
        if "FOMC statement" not in title or not link:
            continue
        try:
            from email.utils import parsedate_to_datetime

            d = parsedate_to_datetime(pub).astimezone(dt.timezone(dt.timedelta(hours=-5))).date()
        except Exception:
            continue
        if d != day:
            continue
        return parse_fomc_text(_http(link))
    return None


def compute(kind, data, ref):
    """ref = (year, month) the release is about. Returns the formatted actual, or None if BLS has not published it yet."""
    if ref not in data:
        return None
    cur = data[ref]
    if kind == "lvl":
        return "%.1f%%" % cur
    if kind == "dk":
        p = data.get(prev_month(*ref))
        return None if p is None else "%dK" % round(cur - p)
    if kind == "mm":
        p = data.get(prev_month(*ref))
        return None if not p else "%.1f%%" % ((cur / p - 1) * 100)
    if kind == "yy":
        p = data.get(prev_month(*ref, k=12))
        return None if not p else "%.1f%%" % ((cur / p - 1) * 100)
    return None


def main(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        news = json.load(open(NEWS, encoding="utf-8"))
    except Exception as e:
        print("no news.json:", e)
        return 0
    try:
        store = json.load(open(STORE, encoding="utf-8"))
    except Exception:
        store = {}

    due = []
    changed = False
    for it in news:
        if (it.get("actual") or "").strip():
            continue
        t = parse_dt(it.get("date", ""))
        mp = match(it.get("title"))
        if not t or not mp:
            continue
        age = (now - t).total_seconds() / 3600.0
        if age < 0 or age > MAX_AGE_H:
            continue
        key = "%s|%s" % (it["title"], it["date"])
        if key in store:
            it["actual"] = store[key]
            changed = True
            continue
        due.append((it, key, mp, t))

    for it, key, (kind, sid), t in [d for d in due if d[2][0] == "fomc"]:
        try:
            val = fomc_actual(t)
        except Exception as e:
            print("warning: Fed statement not readable yet:", e, file=sys.stderr)
            val = None
        if val is None:
            print("not published yet: %s (%s)" % (it["title"], it["date"]))
            continue
        it["actual"] = val
        store[key] = val
        print("ACTUAL %s = %s" % (it["title"], val))
        changed = True
    due = [d for d in due if d[2][0] != "fomc"]
    status = []
    if due:
        ids = {sid for _, _, (_, sid), _ in due}
        try:
            data = bls(ids, now.year)
        except Exception as e:
            print("warning: BLS request failed:", e, file=sys.stderr)
            ERR["bls"] = str(e)[:160]
            data = {}
        fred_data = None
        for it, key, (kind, sid), t in due:
            # the release is about the month before the release date (CPI, PPI, jobs: Oct data comes out in Nov)
            ref = prev_month(t.year, t.month)
            val = compute(kind, data.get(sid, {}), ref)
            src = "BLS"
            if val is None:  # BLS slow / limit reached -> same series from FRED
                if fred_data is None:
                    fred_data = fred(ids)
                val = compute(kind, fred_data.get(sid, {}), ref)
                src = "FRED"
            if val is None:
                print("not published yet: %s (%s)" % (it["title"], it["date"]))
                status.append("%s: not published yet" % it["title"])
                continue
            it["actual"] = val
            store[key] = val
            print("ACTUAL %s = %s (%s)" % (it["title"], val, src))
            status.append("%s: %s from %s" % (it["title"], val, src))
            changed = True
        if ERR:
            status.append("errors: " + json.dumps(ERR))
        # small diagnostic file, rewritten only when the text changes (no commit noise)
        try:
            old = json.load(open("actuals_status.json", encoding="utf-8")).get("status")
        except Exception:
            old = None
        if old != status:
            with open("actuals_status.json", "w", encoding="utf-8") as f:
                json.dump({"checked": now.isoformat(), "status": status}, f, ensure_ascii=False, indent=2)
                f.write("\n")
    # carry stored actuals into news.json even when BLS was not called this run
    for it in news:
        k = "%s|%s" % (it.get("title"), it.get("date"))
        if not (it.get("actual") or "").strip() and k in store:
            it["actual"] = store[k]
            changed = True
    if changed:
        with open(NEWS, "w", encoding="utf-8") as f:
            json.dump(news, f, ensure_ascii=False, indent=2)
            f.write("\n")
        with open(STORE, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
            f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
