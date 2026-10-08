#!/usr/bin/env python3
"""
Builds bias.json: DAILY / WEEKLY / MONTHLY bias for XAUUSD and NASDAQ-100, what changed
versus the previous period, the drivers behind each reading, what big investors are doing,
and supply & demand zones per timeframe.

Each bias is an OUTLOOK that is built once a period CLOSES and stays locked for the next period:
  DAILY   = built right after the 17:00 New York close, valid for the next session.
  WEEKLY  = built after Friday's close (Sunday evening -> Friday week), valid for the coming week.
  MONTHLY = built after the last session of the month, valid for the coming month.
  "What changed" = this outlook vs the previous one. The page tracks the live price against the
  reference close ("since the close: +0.3%, in line with the bias").

Zones: daily bias -> 1H chart, weekly -> 4H chart, monthly -> 1D chart.

Prices: with an OANDA token (secret OANDA_TOKEN) gold = OANDA XAU_USD and Nasdaq = OANDA NAS100_USD CFD candles
(the same kind of price as a broker chart). Without it: gold = SPOT XAUUSD (Yahoo XAUUSD=X, same market as a broker chart; GC=F futures only as a fallback because futures
trade ~$30 above spot), Nasdaq = ^NDX. The page can also apply a broker offset (admin "MATCH" button).
Sources (free, key-less; each is optional - a missing source only removes its factor):
  Yahoo (prices), FRED (real yield, breakeven, 2Y, Fed funds), CFTC COT, news.json (today's events).
A transparent rule-based lean, NOT a prediction and NOT financial advice.
"""
import datetime as dt
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

OUT = "bias.json"
UA = {"User-Agent": "Mozilla/5.0"}
ET, MA = ZoneInfo("America/New_York"), ZoneInfo("Africa/Casablanca")
TH = {  # "meaningful move" over a FULL period (scaled by sqrt(elapsed/full) while the period is in progress)
    "daily": dict(px=0.004, dxy=0.003, ry=0.03, y10=0.04, be=None, vix=0.08, rel=0.002),
    "weekly": dict(px=0.012, dxy=0.008, ry=0.08, y10=0.12, be=0.03, vix=0.15, rel=0.006),
    "monthly": dict(px=0.035, dxy=0.02, ry=0.20, y10=0.30, be=0.10, vix=0.25, rel=0.015),
}
FULL = {"daily": 1, "weekly": 5, "monthly": 21}

# CFD feed (OANDA practice API, free demo token) = the same kind of price as a broker chart.
OANDA_TOKEN = os.environ.get("OANDA_TOKEN", "").strip()
OANDA_HOST = os.environ.get("OANDA_HOST", "https://api-fxpractice.oanda.com").strip()
OANDA_MAP = {"XAUUSD": "XAU_USD", "NASDAQ": "NAS100_USD"}
SRC = {}


# ----------------------------------------------------------------------------- data
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def ohlc(sym, rng, interval):
    j = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range={rng}&interval={interval}")
    r = j["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    out = []
    for i, t in enumerate(r["timestamp"]):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None not in (o, h, l, c):
            # spot FX/gold bars are stamped around the 22:00-00:00 UTC roll: +2h maps Sunday-evening opens to Monday
            d = (dt.datetime.utcfromtimestamp(t) + dt.timedelta(hours=2)).date() if sym.endswith("=X") else dt.datetime.fromtimestamp(t, ET).date()
            out.append({"t": t, "d": d, "o": o, "h": h, "l": l, "c": c})
    return out


def oanda_bars(instr, gran, count):
    """Completed OANDA candles (mid). Daily candles use the 17:00 New York alignment, so the
    Sunday-evening open belongs to Monday: this matches the Sunday -> Friday week."""
    url = f"{OANDA_HOST}/v3/instruments/{instr}/candles?granularity={gran}&count={count}&price=M"
    if gran in ("D", "W", "M"):
        url += "&dailyAlignment=17&alignmentTimezone=America%2FNew_York"
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + OANDA_TOKEN, "Accept-Datetime-Format": "UNIX", **UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode("utf-8"))
    out = []
    for c in j.get("candles", []):
        if not c.get("complete") or "mid" not in c:
            continue
        ts, m = int(float(c["time"])), c["mid"]
        base = ts + 12 * 3600 if gran == "D" else ts
        out.append({"t": ts, "d": dt.datetime.fromtimestamp(base, ET).date(), "o": float(m["o"]), "h": float(m["h"]), "l": float(m["l"]), "c": float(m["c"])})
    return out


def price_daily(asset, sym, alt=None):
    if OANDA_TOKEN:
        try:
            b = oanda_bars(OANDA_MAP[asset], "D", 600)
            if len(b) > 30:
                SRC[asset] = "OANDA " + OANDA_MAP[asset]
                return b
        except Exception as e:
            print(f"warning: OANDA {asset}: {e}", file=sys.stderr)
    b = daily(sym, alt=alt)
    SRC[asset] = "Yahoo " + sym.replace("%5E", "^")
    return b


def drop_open(bars):
    """Daily bias is built on COMPLETED sessions only: drop today's bar until 17:00 New York."""
    now = dt.datetime.now(ET)
    if bars and (bars[-1]["d"] > now.date() or (bars[-1]["d"] == now.date() and now.weekday() < 5 and now.hour < 17)):
        return bars[:-1]
    return bars


def daily(sym, rng="2y", alt=None):
    for s in [sym] + ([alt] if alt else []):
        try:
            b = drop_open(ohlc(s, rng, "1d"))
            if len(b) > 30:
                return b
        except Exception as e:
            print(f"warning: {s}: {e}", file=sys.stderr)
    raise RuntimeError(f"no data for {sym}")


def fred(series):
    req = urllib.request.Request(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        rows = r.read().decode("utf-8").strip().splitlines()[1:]
    out = []
    for ln in rows[-500:]:
        d, _, v = ln.partition(",")
        try:
            out.append((dt.date.fromisoformat(d[:10]), float(v)))
        except ValueError:
            pass
    return out


def cftc(prefix, must=""):
    q = urllib.parse.quote(f"market_and_exchange_names like '{prefix}%'")
    rows = get("https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=" + q + "&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=60")
    names = [r["market_and_exchange_names"] for r in rows]
    pick = next((n for n in names if must.lower() in n.lower()), names[0])
    rows = [r for r in rows if r["market_and_exchange_names"] == pick][:6]
    nets = [float(r["noncomm_positions_long_all"]) - float(r["noncomm_positions_short_all"]) for r in rows]
    return {"date": rows[0]["report_date_as_yyyy_mm_dd"][:10], "net": nets[0], "chg4": nets[0] - nets[min(4, len(nets) - 1)]}


def season(sym):
    pts = ohlc(sym, "max", "1mo")
    now = dt.datetime.utcnow()
    rets = [pts[i]["c"] / pts[i - 1]["c"] - 1 for i in range(1, len(pts))
            if pts[i]["d"].month == now.month and pts[i]["d"].year != now.year][-15:]
    avg, up = sum(rets) / len(rets), sum(1 for r in rets if r > 0) / len(rets)
    return (1 if up >= 0.6 and avg > 0 else -1 if up <= 0.4 and avg < 0 else 0), f"{now.strftime('%B')}: avg {avg:+.1%}, up {up:.0%} of last {len(rets)} years"


# ----------------------------------------------------------------------------- helpers
def S(bars):
    return [(b["d"], b["c"]) for b in bars]


def upto(s, asof):
    return [x for x in s if x[0] <= asof]


def period_start(tf, asof):
    return None if tf == "daily" else (asof - dt.timedelta(days=asof.weekday()) if tf == "weekly" else asof.replace(day=1))


def chg(s, tf, asof, mode):
    """Change since the previous period close (daily: since the previous observation)."""
    s = upto(s, asof)
    if len(s) < 2:
        return None
    last = s[-1][1]
    if tf == "daily":
        base = s[-2][1]
    else:
        st = period_start(tf, asof)
        base = next((v for d, v in reversed(s) if d < st), None)
        if base is None:
            return None
    return last / base - 1 if mode == "pct" else last - base


def lastv(s, asof):
    s = upto(s, asof)
    return s[-1][1] if s else None


def sgn(x, th):
    return None if x is None else (1 if x > th else -1 if x < -th else 0)


def neg(v):
    return None if v is None else -v


# ----------------------------------------------------------------------------- bias
def _build(asset, tf, D, asof):
    gold = asset == "XAUUSD"
    bars = [b for b in D.get("gold" if gold else "ndx", []) if b["d"] <= asof]
    F = []
    st = period_start(tf, asof)
    k = 1 if tf == "daily" else sum(1 for b in bars if st <= b["d"] <= asof)
    N = FULL[tf]
    sc = math.sqrt(max(1, min(k, N)) / N)
    th = {key: (v * sc if v else v) for key, v in TH[tf].items()}

    def add(key, name, reading, v, w):
        if v is not None and w > 0:
            F.append({"key": key, "name": name, "reading": reading, "v": v, "w": w})

    if bars:
        c = chg(S(bars), tf, asof, "pct")
        lbl = {"daily": "since previous close", "weekly": "since Sunday open", "monthly": "since month start"}[tf]
        if c is not None:
            add("trend", "Price trend", f"{c:+.1%} {lbl}", sgn(c, th["px"]), 2)
        b = bars[-1]
        if tf == "daily" and b["h"] > b["l"]:
            pos = (b["c"] - b["l"]) / (b["h"] - b["l"])
            add("close", "Close strength (position in day's range)", f"closed at {pos:.0%} of the range", 1 if pos >= 0.7 else -1 if pos <= 0.3 else 0, 1)
        if tf == "weekly" and len(bars) >= 20:
            dev = bars[-1]["c"] / (sum(x["c"] for x in bars[-20:]) / 20) - 1
            add("ma", "Trend structure (vs 20d avg)", f"{dev:+.1%}", sgn(dev, 0.005), 1)
        if tf == "monthly" and len(bars) >= 100:
            dev = bars[-1]["c"] / (sum(x["c"] for x in bars[-100:]) / 100) - 1
            add("ma", "Long-term trend (vs 100d avg)", f"{dev:+.1%}", sgn(dev, 0.01), 1.5)
    ry, tnx, dxy, vix = D.get("ry"), D.get("tnx"), D.get("dxy"), D.get("vix")
    if gold and ry:
        d = chg(ry, tf, asof, "diff")
        if d is not None:
            add("ry", "10Y real yield", f"{lastv(ry, asof):.2f}% ({d:+.2f})", neg(sgn(d, th["ry"])), 2)
    if not gold and tnx:
        d = chg(S(tnx), tf, asof, "diff")
        if d is not None:
            add("y10", "US10Y yield", f"{lastv(S(tnx), asof):.2f}% ({d:+.2f})", neg(sgn(d, th["y10"])), 2)
    if dxy:
        c = chg(S(dxy), tf, asof, "pct")
        if c is not None:
            add("usd", "US dollar (DXY)", f"{c:+.1%}", neg(sgn(c, th["dxy"])), 1.5 if gold else 0.5)
    if D.get("dgs2") and D.get("dff") and tf != "daily":
        a, f = lastv(D["dgs2"], asof), lastv(D["dff"], asof)
        if a is not None and f is not None:
            s_ = a - f
            add("policy", "Fed pricing (2Y vs Fed funds)", f"2Y {a:.2f}% vs FFR {f:.2f}%", 1 if s_ < -0.25 else -1 if s_ > 0.15 else 0, 1 if tf == "weekly" else 2 if gold else 1.5)
    if gold and D.get("be") and th["be"]:
        d = chg(D["be"], tf, asof, "diff")
        if d is not None:
            add("infl", "Inflation expectations (10Y breakeven)", f"{lastv(D['be'], asof):.2f}% ({d:+.2f})", sgn(d, th["be"]), 1)
    if vix:
        lv = lastv(S(vix), asof)
        if lv is not None:
            if gold:
                add("vix", "Fear (VIX)", f"VIX {lv:.1f}", 1 if lv >= 25 else -1 if lv <= 14 else 0, 0.5)
            else:
                vc = chg(S(vix), tf, asof, "pct")
                v = -1 if lv >= 22 or (vc is not None and vc >= th["vix"]) else 1 if lv <= 16 and (vc or 0) <= 0.05 else 0
                add("vix", "Fear (VIX)", f"VIX {lv:.1f}" + (f" ({vc:+.0%})" if vc is not None else ""), v, 1.5)
    if not gold and D.get("ndx") and D.get("spx"):
        a, b2 = chg(S(D["ndx"]), tf, asof, "pct"), chg(S(D["spx"]), tf, asof, "pct")
        if a is not None and b2 is not None:
            add("lead", "Tech leadership (NDX vs S&P)", f"{a - b2:+.1%}", sgn(a - b2, th["rel"]), 1)
    cot = D.get("cot_g" if gold else "cot_n")
    if cot and tf != "daily":
        add("cot", "Speculator positioning (CFTC, 4w change)", f"net {cot['net']:+,.0f} ({cot['chg4']:+,.0f})", sgn(cot["chg4"] / (abs(cot["net"]) + 1), 0.05), 1.5 if tf == "weekly" and gold else 1)
    se = D.get("s_g" if gold else "s_n")
    if se and tf == "monthly":
        add("season", "Seasonality (this month)", se[1], se[0], 1)
    sw = sum(f["w"] for f in F)
    score = sum(f["w"] * f["v"] for f in F) / sw if sw else 0.0
    a = abs(score)
    lvl = "NEUTRAL" if a < 0.15 else "SLIGHT" if a < 0.4 else "MODERATE" if a < 0.7 else "STRONG"
    dire = "Neutral" if a < 0.15 else "Bullish" if score > 0 else "Bearish"
    if tf == "daily":
        period, status = f"Close of {asof:%a %b %d}", "closed"
    elif tf == "weekly":
        period, status = f"Week of {st:%b %d} (Sun to Fri) · day {min(k, 5)}/5", "closed" if asof.weekday() == 4 else "in progress"
    else:
        nxt = asof + dt.timedelta(days=1)
        while nxt.weekday() > 4:
            nxt += dt.timedelta(days=1)
        period, status = f"{st:%B %Y} · day {k}/{N}", "closed" if nxt.month != asof.month else "in progress"
    return {"score": round(score, 2), "label": lvl if dire == "Neutral" else f"{lvl} {dire.upper()}", "dir": dire,
            "pct": 50 if dire == "Neutral" else min(90, 50 + round(40 * a)), "asof": str(asof), "period": period, "status": status, "drivers": F}


def pick_asof(tf, dates):
    """Last COMPLETED period: daily = last closed session, weekly = last closed week (Friday),
    monthly = last closed month. While a period is still running we use the previous one, so the
    bias stays locked until the next close."""
    last = dates[-1]
    if tf == "daily":
        return last
    today = dt.datetime.now(ET).date()
    st = period_start(tf, last)
    if tf == "weekly":
        done = last.weekday() == 4 or today.weekday() >= 5 or period_start("weekly", today) > st
    else:
        nxt = last + dt.timedelta(days=1)
        while nxt.weekday() > 4:
            nxt += dt.timedelta(days=1)
        done = nxt.month != last.month or today.month != last.month
    return last if done else next((d for d in reversed(dates) if d < st), None)


def outlook(tf, asof):
    if tf == "daily":
        t = asof + dt.timedelta(days=1)
        while t.weekday() > 4:
            t += dt.timedelta(days=1)
        return f"Outlook for {t:%a %b %d} (built from the {asof:%a %b %d} close)", t
    if tf == "weekly":
        t = period_start("weekly", asof) + dt.timedelta(days=7)
        return f"Outlook for the week of {t:%b %d} (built from the week ending {asof:%a %b %d})", t
    t = (asof.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
    return f"Outlook for {t:%B %Y} (built from the {asof:%B} close)", t


def build(asset, tf, D):
    dates = sorted({b["d"] for b in D.get("gold" if asset == "XAUUSD" else "ndx", [])})
    if not dates:
        return None
    asof = pick_asof(tf, dates)
    if asof is None:
        return None
    cur = _build(asset, tf, D, asof)
    if tf == "daily":
        i = dates.index(asof)
        prev_asof = dates[i - 1] if i > 0 else None
    else:
        prev_asof = next((d for d in reversed(dates) if d < period_start(tf, asof)), None)
    if prev_asof:
        pv = _build(asset, tf, D, prev_asof)
        pk = {f["key"]: f for f in pv["drivers"]}
        flips = [{"name": f["name"], "from": pk[f["key"]]["v"], "to": f["v"]} for f in cur["drivers"] if f["key"] in pk and pk[f["key"]]["v"] != f["v"]]
        cur["changes"] = {"vs": {"daily": "the previous day's outlook", "weekly": "last week's outlook", "monthly": "last month's outlook"}[tf],
                          "prev_label": pv["label"], "prev_period": pv["period"], "score_delta": round(cur["score"] - pv["score"], 2), "flips": flips}
    cur["period"], target = outlook(tf, asof)
    cur["status"] = "active" if dt.datetime.now(ET).date() >= target else "upcoming"
    cur["target"] = str(target)
    cur["built_from"] = str(asof)
    cur["ref_price"] = round(next(b["c"] for b in reversed(D["gold" if asset == "XAUUSD" else "ndx"]) if b["d"] <= asof), 2)
    return cur


def investors(asset, D):
    L, gold = [], asset == "XAUUSD"
    asof = max(b["d"] for b in D["gold" if gold else "ndx"]) if D.get("gold" if gold else "ndx") else dt.date.today()
    c = D.get("cot_g" if gold else "cot_n")
    nm = "gold" if gold else "Nasdaq"
    if c:
        L.append(f"Large speculators (CFTC, {c['date']}) are net {'long' if c['net'] > 0 else 'short'} {abs(c['net']):,.0f} contracts in {nm}, {c['chg4']:+,.0f} vs 4 weeks ago: {'adding to' if c['chg4'] > 0 else 'cutting'} exposure.")
    a, f = (lastv(D["dgs2"], asof), lastv(D["dff"], asof)) if D.get("dgs2") and D.get("dff") else (None, None)
    if a is not None and f is not None:
        s_ = a - f
        L.append(f"Bond market: 2Y yield {a:.2f}% vs Fed funds {f:.2f}% -> {'rate cuts are priced in' if s_ < -0.25 else 'rate hikes are priced in' if s_ > 0.15 else 'little change in rates is priced'}.")

    def m1(s):
        s = upto(s, asof)
        return s[-1][1] - s[-22][1] if len(s) > 22 else None
    if gold and D.get("ry"):
        d = m1(D["ry"])
        if d is not None:
            L.append(f"10Y real yield {lastv(D['ry'], asof):.2f}% ({d:+.2f} in 1 month): " + ("a headwind, bonds pay investors more to wait." if d > 0.05 else "a tailwind, holding gold costs less." if d < -0.05 else "stable, no strong push."))
    if not gold and D.get("tnx"):
        d = m1(S(D["tnx"]))
        if d is not None:
            L.append(f"US10Y {lastv(S(D['tnx']), asof):.2f}% ({d:+.2f} in 1 month): " + ("rising yields pressure growth stocks." if d > 0.1 else "falling yields support growth stocks." if d < -0.1 else "stable."))
    if D.get("vix"):
        lv = lastv(S(D["vix"]), asof)
        if lv is not None:
            L.append(f"VIX {lv:.1f}: " + ("fear is high, investors hedge and seek safe havens." if lv >= 25 else "markets are calm, low demand for protection." if lv <= 15 else "moderate risk appetite."))
    if not gold and D.get("ndx") and D.get("spx"):
        ns, ss = upto(S(D["ndx"]), asof), upto(S(D["spx"]), asof)
        if len(ns) > 22 and len(ss) > 22:
            r = (ns[-1][1] / ns[-22][1]) - (ss[-1][1] / ss[-22][1])
            L.append(f"Tech vs S&P 500 over 1 month: {r:+.1%} -> investors are {'rotating into' if r > 0 else 'rotating out of'} tech.")
    if D.get("dxy"):
        s = upto(S(D["dxy"]), asof)
        if len(s) > 22:
            c1 = s[-1][1] / s[-22][1] - 1
            L.append(f"US dollar {c1:+.1%} in 1 month: " + ("stronger dollar, a headwind for gold." if gold and c1 > 0.01 else "weaker dollar, a tailwind for gold." if gold and c1 < -0.01 else "dollar broadly flat." if abs(c1) <= 0.01 else "dollar moving, watch the reaction in risk assets."))
    return L


# ----------------------------------------------------------------------------- zones
def to_4h(bars):
    g = {}
    for b in bars:
        d = dt.datetime.utcfromtimestamp(b["t"])
        g.setdefault((d.date(), d.hour // 4), []).append(b)
    return [{"t": g[k][0]["t"], "o": g[k][0]["o"], "h": max(b["h"] for b in g[k]), "l": min(b["l"] for b in g[k]), "c": g[k][-1]["c"]} for k in sorted(g)]


def find_zones(bars, lookback):
    """Supply/demand zones: (1) base + explosive move, (2) a looser version, (3) swing-turn fallback.
    Broken zones are dropped, fresh/tested is tracked, nearest zones on each side are returned."""
    bars = bars[-lookback:]
    n = len(bars)
    if n < 40:
        return None, None
    tr = [bars[0]["h"] - bars[0]["l"]] + [max(bars[i]["h"] - bars[i]["l"], abs(bars[i]["h"] - bars[i - 1]["c"]), abs(bars[i]["l"] - bars[i - 1]["c"])) for i in range(1, n)]
    atr = [sum(tr[max(0, i - 13):i + 1]) / len(tr[max(0, i - 13):i + 1]) for i in range(n)]
    Z = []
    for bm, bd, im, tag in ((1.2, 0.6, 1.2, "base"), (1.8, 0.9, 0.9, "base")):
        for i in range(14, n - 1):
            a = atr[i - 1]
            if a <= 0:
                continue
            for kk in (1, 2, 3):
                if i + kk >= n:
                    break
                base = bars[i:i + kk]
                hi, lo = max(b["h"] for b in base), min(b["l"] for b in base)
                if hi - lo > bm * a or any(abs(b["c"] - b["o"]) > bd * a for b in base):
                    continue
                imp = bars[i + kk]
                body = imp["c"] - imp["o"]
                if abs(body) >= im * a and ((body > 0 and imp["c"] > hi) or (body < 0 and imp["c"] < lo)):
                    if body > 0:
                        Z.append({"type": "demand", "top": max(max(b["o"], b["c"]) for b in base), "bottom": lo, "strength": abs(body) / a, "idx": i + kk, "kind": tag})
                    else:
                        Z.append({"type": "supply", "top": hi, "bottom": min(min(b["o"], b["c"]) for b in base), "strength": abs(body) / a, "idx": i + kk, "kind": tag})
                    break
    for i in range(2, n - 6):  # swing-turn fallback
        a = atr[i]
        if a <= 0:
            continue
        if bars[i]["h"] > max(bars[j]["h"] for j in (i - 2, i - 1, i + 1, i + 2)):
            drop = bars[i]["h"] - min(b["l"] for b in bars[i + 1:i + 7])
            if drop >= 1.5 * a:
                Z.append({"type": "supply", "top": bars[i]["h"], "bottom": max(max(bars[i]["o"], bars[i]["c"]), bars[i]["h"] - 0.8 * a), "strength": drop / a, "idx": i, "kind": "swing"})
        if bars[i]["l"] < min(bars[j]["l"] for j in (i - 2, i - 1, i + 1, i + 2)):
            rise = max(b["h"] for b in bars[i + 1:i + 7]) - bars[i]["l"]
            if rise >= 1.5 * a:
                Z.append({"type": "demand", "top": min(min(bars[i]["o"], bars[i]["c"]), bars[i]["l"] + 0.8 * a), "bottom": bars[i]["l"], "strength": rise / a, "idx": i, "kind": "swing"})
    px = bars[-1]["c"]
    keep = []
    for z in sorted(Z, key=lambda z: (-z["strength"], -z["idx"])):
        if z["top"] <= z["bottom"]:
            continue
        later = bars[z["idx"] + 1:]
        if z["type"] == "demand":
            if any(b["c"] < z["bottom"] for b in later):
                continue
            z["fresh"] = not any(b["l"] <= z["top"] for b in later)
        else:
            if any(b["c"] > z["top"] for b in later):
                continue
            z["fresh"] = not any(b["h"] >= z["bottom"] for b in later)
        if any(k2["type"] == z["type"] and min(k2["top"], z["top"]) - max(k2["bottom"], z["bottom"]) > 0.3 * min(k2["top"] - k2["bottom"], z["top"] - z["bottom"]) for k2 in keep):
            continue
        keep.append(z)
    out = {"supply": [], "demand": []}
    for z in keep:
        item = {"top": round(z["top"], 2), "bottom": round(z["bottom"], 2), "fresh": z["fresh"], "strength": round(min(z["strength"], 9.9), 1), "kind": z["kind"],
                "formed": dt.datetime.utcfromtimestamp(bars[z["idx"]]["t"]).strftime("%Y-%m-%d %H:%M"), "rec": round(z["idx"] / n, 2),
                "inside": z["bottom"] <= px <= z["top"], "dist": round(((z["top"] if z["type"] == "demand" else z["bottom"]) - px) / px * 100, 2)}
        if z["type"] == "demand" and z["bottom"] <= px:
            out["demand"].append(item)
        elif z["type"] == "supply" and z["top"] >= px:
            out["supply"].append(item)
    out["demand"].sort(key=lambda x: -x["dist"])
    out["supply"].sort(key=lambda x: x["dist"])
    out["demand"], out["supply"] = out["demand"][:6], out["supply"][:6]
    return out, round(px, 2)


def grade_zones(res):
    """Quality grade A/B/C: size of the move, freshness, base vs swing, recency, and confluence
    (the same zone also exists on another timeframe). Keeps the 3 best zones per side."""
    tfs = [t for t in ("daily", "weekly", "monthly") if res.get(t)]
    for t in tfs:
        for side in ("supply", "demand"):
            for z in res[t][side]:
                conf = [res[o]["tf"] for o in tfs if o != t and any(min(z["top"], y["top"]) > max(z["bottom"], y["bottom"]) for y in res[o][side])]
                sc = min(z["strength"], 4) / 4 * 35 + (25 if z["fresh"] else 8) + (10 if z["kind"] == "base" else 4) + z["rec"] * 10 + min(20, 15 * len(conf))
                z["conf"], z["score"], z["grade"] = conf, round(sc), "A" if sc >= 65 else "B" if sc >= 45 else "C"
    for t in tfs:
        res[t]["supply"] = sorted(sorted(res[t]["supply"], key=lambda z: -z["score"])[:3], key=lambda z: z["dist"])
        res[t]["demand"] = sorted(sorted(res[t]["demand"], key=lambda z: -z["score"])[:3], key=lambda z: -z["dist"])


def zones_for(cands, notes, asset=None):
    if OANDA_TOKEN and asset in OANDA_MAP:
        try:
            ins = OANDA_MAP[asset]
            h1, h4, d1 = oanda_bars(ins, "H1", 2500), oanda_bars(ins, "H4", 1000), oanda_bars(ins, "D", 600)
            res = {"symbol": "OANDA " + ins}
            for tf, bars, lb, label in (("daily", h1, 500, "1H"), ("weekly", h4, 300, "4H"), ("monthly", d1, 260, "1D")):
                z, px = find_zones(bars, lb) if bars else (None, None)
                res[tf] = {"tf": label, "price": px, **(z or {"supply": [], "demand": []})}
            grade_zones(res)
            return res
        except Exception as e:
            print(f"warning: OANDA zones {asset}: {e}", file=sys.stderr)
            notes.append("OANDA zones failed, using Yahoo")
    for sym in cands:
        h1 = None
        for rng in ("6mo", "3mo", "1mo"):
            try:
                h1 = ohlc(sym, rng, "1h")
                if len(h1) > 150:
                    break
            except Exception as e:
                print(f"warning: 1h {sym} {rng}: {e}", file=sys.stderr)
        try:
            d1 = ohlc(sym, "2y", "1d")
        except Exception as e:
            print(f"warning: 1d {sym}: {e}", file=sys.stderr)
            d1 = None
        if not (h1 or d1):
            continue
        res = {"symbol": sym.replace("%5E", "^")}
        for tf, bars, lb, label in (("daily", h1, 500, "1H"), ("weekly", to_4h(h1) if h1 else None, 300, "4H"), ("monthly", d1, 260, "1D")):
            z, px = find_zones(bars, lb) if bars else (None, None)
            res[tf] = {"tf": label, "price": px, **(z or {"supply": [], "demand": []})}
        grade_zones(res)
        return res
    notes.append("zones: no candle data")
    return None


def events_today():
    try:
        news = json.load(open("news.json", encoding="utf-8"))
    except Exception:
        return []
    today = dt.datetime.now(MA).date()
    out = []
    for e in news:
        if e.get("impact") == "High":
            w = dt.datetime.fromisoformat(e["date"]).astimezone(MA)
            if w.date() == today:
                out.append(f"{e['title']} at {w:%H:%M} (Morocco)")
    return out


def main():
    D, notes = {}, []
    src = {"gold": lambda: price_daily("XAUUSD", "XAUUSD=X", alt="GC=F"), "ndx": lambda: price_daily("NASDAQ", "%5ENDX", alt="NQ=F"), "spx": lambda: daily("%5EGSPC"),
           "dxy": lambda: daily("DX-Y.NYB"), "tnx": lambda: daily("%5ETNX"), "vix": lambda: daily("%5EVIX"),
           "ry": lambda: fred("DFII10"), "be": lambda: fred("T10YIE"), "dgs2": lambda: fred("DGS2"), "dff": lambda: fred("DFF"),
           "cot_g": lambda: cftc("GOLD - COMMODITY EXCHANGE"), "cot_n": lambda: cftc("NASDAQ", "MINI"),
           "s_g": lambda: season("GC=F"), "s_n": lambda: season("%5ENDX")}
    for k, fn in src.items():
        try:
            D[k] = fn()
        except Exception as e:
            print(f"warning: {k} unavailable: {e}", file=sys.stderr)
            notes.append(f"{k}: source unavailable")
    if not (D.get("gold") or D.get("ndx")):
        print("error: no price data, leaving bias.json untouched", file=sys.stderr)
        sys.exit(1)
    data = {"updated": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), "events_today": events_today(), "notes": notes, "assets": {}}
    for asset in ("XAUUSD", "NASDAQ"):
        bars = D.get("gold" if asset == "XAUUSD" else "ndx")
        tf = {t: build(asset, t, D) for t in TH} if bars else {}
        data["assets"][asset] = {"price": round(bars[-1]["c"], 2) if bars else None, "tf": tf, "investors": investors(asset, D),
                                 "source": SRC.get(asset), "zones": zones_for(["XAUUSD=X", "GC=F"] if asset == "XAUUSD" else ["%5ENDX", "NQ=F"], notes, asset)}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", OUT, {a: {t: v["label"] for t, v in x["tf"].items() if v} for a, x in data["assets"].items()})


if __name__ == "__main__":
    main()
