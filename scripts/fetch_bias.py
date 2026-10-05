#!/usr/bin/env python3
"""
Builds bias.json: DAILY / WEEKLY / MONTHLY bias for XAUUSD and NASDAQ-100, the drivers
behind each reading, and what big investors are doing (positioning / pricing).

Free, key-less sources (all optional - a missing source only removes its factor):
  Yahoo   : gold (GC=F), Nasdaq-100 (^NDX), S&P500 (^GSPC), dollar (DX-Y.NYB), US10Y (^TNX), VIX (^VIX)
  FRED    : 10Y real yield (DFII10), 10Y breakeven inflation (T10YIE), 2Y yield (DGS2), Fed funds (DFF)
  CFTC    : Commitments of Traders, large speculators in gold and E-mini Nasdaq (weekly)
  news.json (from fetch_calendar.py): high-impact events today

Supply & demand zones (rally-base-rally / drop-base-drop style) are computed per bias timeframe:
  monthly bias -> 1D chart, weekly bias -> 4H chart (aggregated from 1H), daily bias -> 1H chart.

Every factor is -1 (bearish) / 0 / +1 (bullish) with a weight; score = weighted average.
It is a transparent rule-based lean, NOT a prediction and NOT financial advice.
"""
import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

OUT = "bias.json"
UA = {"User-Agent": "Mozilla/5.0"}
TH = {  # per timeframe: horizon (trading days) and "meaningful move" thresholds
    "daily": dict(n=1, px=0.004, dxy=0.003, ry=0.03, y10=0.04, be=None, vix=0.08, rel=0.002),
    "weekly": dict(n=5, px=0.012, dxy=0.008, ry=0.08, y10=0.12, be=0.03, vix=0.15, rel=0.006),
    "monthly": dict(n=21, px=0.035, dxy=0.02, ry=0.20, y10=0.30, be=0.10, vix=0.25, rel=0.015),
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def yahoo(sym, rng="1y", interval="1d"):
    j = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range={rng}&interval={interval}")
    r = j["chart"]["result"][0]
    return [(t, c) for t, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]) if c is not None]


def fred(series):
    req = urllib.request.Request(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        rows = r.read().decode("utf-8").strip().splitlines()[1:]
    out = []
    for ln in rows:
        d, _, v = ln.partition(",")
        try:
            out.append(float(v))
        except ValueError:
            pass
    return out


def cftc(prefix, must=""):
    """Large-speculator net position (legacy futures-only report)."""
    q = urllib.parse.quote(f"market_and_exchange_names like '{prefix}%'")
    url = ("https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=" + q +
           "&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=60")
    rows = get(url)
    names = [r["market_and_exchange_names"] for r in rows]
    pick = next((n for n in names if must.lower() in n.lower()), names[0])
    rows = [r for r in rows if r["market_and_exchange_names"] == pick][:6]
    nets = [float(r["noncomm_positions_long_all"]) - float(r["noncomm_positions_short_all"]) for r in rows]
    return {"date": rows[0]["report_date_as_yyyy_mm_dd"][:10], "net": nets[0], "chg4": nets[0] - nets[min(4, len(nets) - 1)]}


def ohlc(sym, rng, interval):
    j = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range={rng}&interval={interval}")
    r = j["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    out = []
    for i, t in enumerate(r["timestamp"]):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None not in (o, h, l, c):
            out.append({"t": t, "o": o, "h": h, "l": l, "c": c})
    return out


def to_4h(bars):
    g = {}
    for b in bars:
        d = dt.datetime.utcfromtimestamp(b["t"])
        g.setdefault((d.date(), d.hour // 4), []).append(b)
    out = []
    for k in sorted(g):
        x = g[k]
        out.append({"t": x[0]["t"], "o": x[0]["o"], "h": max(b["h"] for b in x), "l": min(b["l"] for b in x), "c": x[-1]["c"]})
    return out


def find_zones(bars, lookback):
    """Base (1-3 tight candles) followed by an explosive candle that leaves it = supply/demand zone."""
    bars = bars[-lookback:]
    n = len(bars)
    if n < 30:
        return [], None
    tr = [bars[0]["h"] - bars[0]["l"]] + [max(bars[i]["h"] - bars[i]["l"], abs(bars[i]["h"] - bars[i - 1]["c"]), abs(bars[i]["l"] - bars[i - 1]["c"])) for i in range(1, n)]
    atr = [sum(tr[max(0, i - 13):i + 1]) / len(tr[max(0, i - 13):i + 1]) for i in range(n)]
    zones = []
    for i in range(14, n - 1):
        a = atr[i - 1]
        if a <= 0:
            continue
        for k in (1, 2, 3):
            if i + k >= n:
                break
            base = bars[i:i + k]
            hi, lo = max(b["h"] for b in base), min(b["l"] for b in base)
            if hi - lo > 1.2 * a or any(abs(b["c"] - b["o"]) > 0.6 * a for b in base):
                continue
            imp = bars[i + k]
            body = imp["c"] - imp["o"]
            if abs(body) >= 1.2 * a and ((body > 0 and imp["c"] > hi) or (body < 0 and imp["c"] < lo)):
                if body > 0:
                    z = {"type": "demand", "top": max(max(b["o"], b["c"]) for b in base), "bottom": lo}
                else:
                    z = {"type": "supply", "top": hi, "bottom": min(min(b["o"], b["c"]) for b in base)}
                z.update(strength=abs(body) / a, idx=i + k)
                zones.append(z)
                break
    px = bars[-1]["c"]
    keep = []
    for z in sorted(zones, key=lambda z: -z["idx"]):
        later = bars[z["idx"] + 1:]
        if z["type"] == "demand":
            if any(b["c"] < z["bottom"] for b in later):
                continue
            z["fresh"] = not any(b["l"] <= z["top"] for b in later)
        else:
            if any(b["c"] > z["top"] for b in later):
                continue
            z["fresh"] = not any(b["h"] >= z["bottom"] for b in later)
        if any(k["type"] == z["type"] and min(k["top"], z["top"]) - max(k["bottom"], z["bottom"]) > 0.5 * (z["top"] - z["bottom"]) for k in keep):
            continue
        keep.append(z)
    out = {"supply": [], "demand": []}
    for z in keep:
        ts = dt.datetime.utcfromtimestamp(bars[z["idx"]]["t"]).strftime("%Y-%m-%d %H:%M")
        item = {"top": round(z["top"], 2), "bottom": round(z["bottom"], 2), "fresh": z["fresh"], "strength": round(z["strength"], 1), "formed": ts,
                "inside": z["bottom"] <= px <= z["top"], "dist": round(((z["top"] if z["type"] == "demand" else z["bottom"]) - px) / px * 100, 2)}
        if z["type"] == "demand" and z["bottom"] <= px:
            out["demand"].append(item)
        elif z["type"] == "supply" and z["top"] >= px:
            out["supply"].append(item)
    out["demand"].sort(key=lambda x: -x["dist"])
    out["supply"].sort(key=lambda x: x["dist"])
    out["demand"], out["supply"] = out["demand"][:2], out["supply"][:2]
    return out, round(px, 2)


def zones_for(cands):
    for sym in cands:
        try:
            h1 = ohlc(sym, "6mo", "1h")
            d1 = ohlc(sym, "2y", "1d")
            res = {"symbol": sym.replace("%5E", "^")}
            for tf, bars, lb, label in (("daily", h1, 500, "1H"), ("weekly", to_4h(h1), 300, "4H"), ("monthly", d1, 260, "1D")):
                z, px = find_zones(bars, lb)
                res[tf] = {"tf": label, "price": px, **z}
            return res
        except Exception as e:
            print(f"warning: zones {sym}: {e}", file=sys.stderr)
    return None


def pct(a, n):
    return a[-1] / a[-1 - n] - 1 if len(a) > n else None


def diff(a, n):
    return a[-1] - a[-1 - n] if len(a) > n else None


def sgn(x, th):
    return None if x is None else (1 if x > th else -1 if x < -th else 0)


def neg(v):
    return None if v is None else -v


def season(sym):
    pts = yahoo(sym, "max", "1mo")
    now = dt.datetime.utcnow()
    rets = [pts[i][1] / pts[i - 1][1] - 1 for i in range(1, len(pts))
            if dt.datetime.utcfromtimestamp(pts[i][0]).month == now.month
            and (dt.datetime.utcfromtimestamp(pts[i][0]).year, now.month) != (now.year, now.month)][-15:]
    avg, up = sum(rets) / len(rets), sum(1 for r in rets if r > 0) / len(rets)
    return (1 if up >= 0.6 and avg > 0 else -1 if up <= 0.4 and avg < 0 else 0), f"{now.strftime('%B')}: avg {avg:+.1%}, up {up:.0%} of last {len(rets)} years"


def build(asset, tf, D):
    th, n, F = TH[tf], TH[tf]["n"], []

    def add(key, name, reading, v, w):
        if v is not None and w > 0:
            F.append({"key": key, "name": name, "reading": reading, "v": v, "w": w})

    gold = asset == "XAUUSD"
    px = D.get("gold" if gold else "ndx")
    if px:
        c = pct(px, n)
        if c is not None:
            add("trend", "Price trend", f"{c:+.1%} over {n}d", sgn(c, th["px"]), 2)
        if tf == "monthly" and len(px) >= 100:
            dev = px[-1] / (sum(px[-100:]) / 100) - 1
            add("ma", "Long-term trend (vs 100d avg)", f"{dev:+.1%}", sgn(dev, 0.01), 1.5)
    if gold and D.get("ry"):
        d = diff(D["ry"], n)
        if d is not None:
            add("ry", "10Y real yield", f"{D['ry'][-1]:.2f}% ({d:+.2f} in {n}d)", neg(sgn(d, th["ry"])), 2)
    if not gold and D.get("tnx"):
        d = diff(D["tnx"], n)
        if d is not None:
            add("y10", "US10Y yield", f"{D['tnx'][-1]:.2f}% ({d:+.2f} in {n}d)", neg(sgn(d, th["y10"])), 2)
    if D.get("dxy"):
        c = pct(D["dxy"], n)
        if c is not None:
            add("usd", "US dollar (DXY)", f"{c:+.1%} over {n}d", neg(sgn(c, th["dxy"])), 1.5 if gold else 0.5)
    if D.get("dgs2") and D.get("dff") and tf != "daily":
        s = D["dgs2"][-1] - D["dff"][-1]
        v = 1 if s < -0.25 else -1 if s > 0.15 else 0
        add("policy", "Fed pricing (2Y vs Fed funds)", f"2Y {D['dgs2'][-1]:.2f}% vs FFR {D['dff'][-1]:.2f}%", v, 1 if tf == "weekly" else 2 if gold else 1.5)
    if gold and D.get("be") and th["be"]:
        d = diff(D["be"], n)
        if d is not None:
            add("infl", "Inflation expectations (10Y breakeven)", f"{D['be'][-1]:.2f}% ({d:+.2f} in {n}d)", sgn(d, th["be"]), 1)
    if D.get("vix"):
        lv = D["vix"][-1]
        if gold:
            add("vix", "Fear (VIX)", f"VIX {lv:.1f}", 1 if lv >= 25 else -1 if lv <= 14 else 0, 0.5)
        else:
            vc = pct(D["vix"], n)
            v = -1 if lv >= 22 or (vc is not None and vc >= th["vix"]) else 1 if lv <= 16 and (vc or 0) <= 0.05 else 0
            add("vix", "Fear (VIX)", f"VIX {lv:.1f}" + (f" ({vc:+.0%} in {n}d)" if vc is not None else ""), v, 1.5)
    if not gold and D.get("ndx") and D.get("spx"):
        a, b = pct(D["ndx"], n), pct(D["spx"], n)
        if a is not None and b is not None:
            add("lead", "Tech leadership (NDX vs S&P)", f"{a - b:+.1%} over {n}d", sgn(a - b, th["rel"]), 1)
    cot = D.get("cot_g" if gold else "cot_n")
    if cot and tf != "daily":
        rel = cot["chg4"] / (abs(cot["net"]) + 1)
        add("cot", "Speculator positioning (CFTC, 4w change)", f"net {cot['net']:+,.0f} ({cot['chg4']:+,.0f})", sgn(rel, 0.05), 1.5 if tf == "weekly" and gold else 1)
    se = D.get("s_g" if gold else "s_n")
    if se and tf == "monthly":
        add("season", "Seasonality (this month)", se[1], se[0], 1)
    sw = sum(f["w"] for f in F)
    score = sum(f["w"] * f["v"] for f in F) / sw if sw else 0.0
    a = abs(score)
    lvl = "NEUTRAL" if a < 0.15 else "SLIGHT" if a < 0.4 else "MODERATE" if a < 0.7 else "STRONG"
    dire = "Neutral" if a < 0.15 else "Bullish" if score > 0 else "Bearish"
    pctv = 50 if dire == "Neutral" else min(90, 50 + round(40 * a))
    return {"score": round(score, 2), "label": lvl if dire == "Neutral" else f"{lvl} {dire.upper()}", "dir": dire, "pct": pctv, "drivers": F}


def investors(asset, D):
    L, gold = [], asset == "XAUUSD"
    c = D.get("cot_g" if gold else "cot_n")
    nm = "gold" if gold else "Nasdaq"
    if c:
        L.append(f"Large speculators (CFTC, {c['date']}) are net {'long' if c['net'] > 0 else 'short'} {abs(c['net']):,.0f} contracts in {nm}, "
                 f"{c['chg4']:+,.0f} vs 4 weeks ago: {'adding to' if c['chg4'] > 0 else 'cutting'} exposure.")
    if D.get("dgs2") and D.get("dff"):
        s = D["dgs2"][-1] - D["dff"][-1]
        L.append(f"Bond market: 2Y yield {D['dgs2'][-1]:.2f}% vs Fed funds {D['dff'][-1]:.2f}% -> "
                 f"{'rate cuts are priced in' if s < -0.25 else 'rate hikes are priced in' if s > 0.15 else 'little change in rates is priced'}.")
    if gold and D.get("ry"):
        d = diff(D["ry"], 21)
        if d is not None:
            L.append(f"10Y real yield {D['ry'][-1]:.2f}% ({d:+.2f} in 1 month): " + ("a headwind, bonds pay investors more to wait." if d > 0.05 else "a tailwind, holding gold costs less." if d < -0.05 else "stable, no strong push."))
    if not gold and D.get("tnx"):
        d = diff(D["tnx"], 21)
        if d is not None:
            L.append(f"US10Y {D['tnx'][-1]:.2f}% ({d:+.2f} in 1 month): " + ("rising yields pressure growth stocks." if d > 0.1 else "falling yields support growth stocks." if d < -0.1 else "stable."))
    if D.get("vix"):
        lv = D["vix"][-1]
        L.append(f"VIX {lv:.1f}: " + ("fear is high, investors hedge and seek safe havens." if lv >= 25 else "markets are calm, low demand for protection." if lv <= 15 else "moderate risk appetite."))
    if not gold and D.get("ndx") and D.get("spx"):
        a, b = pct(D["ndx"], 21), pct(D["spx"], 21)
        if a is not None and b is not None:
            L.append(f"Tech vs S&P 500 over 1 month: {a - b:+.1%} -> investors are {'rotating into' if a > b else 'rotating out of'} tech.")
    if D.get("dxy"):
        c1 = pct(D["dxy"], 21)
        if c1 is not None:
            L.append(f"US dollar {c1:+.1%} in 1 month: " + ("stronger dollar, a headwind for gold." if gold and c1 > 0.01 else "weaker dollar, a tailwind for gold." if gold and c1 < -0.01 else "dollar broadly flat." if abs(c1) <= 0.01 else "dollar moving, watch the reaction in risk assets."))
    return L


def events_today():
    try:
        news = json.load(open("news.json", encoding="utf-8"))
    except Exception:
        return []
    ma = ZoneInfo("Africa/Casablanca")
    today = dt.datetime.now(ma).date()
    out = []
    for e in news:
        if e.get("impact") != "High":
            continue
        w = dt.datetime.fromisoformat(e["date"]).astimezone(ma)
        if w.date() == today:
            out.append(f"{e['title']} at {w:%H:%M} (Morocco)")
    return out


def main():
    D, notes = {}, []
    src = {"gold": lambda: [x[1] for x in yahoo("GC=F")], "ndx": lambda: [x[1] for x in yahoo("%5ENDX")],
           "spx": lambda: [x[1] for x in yahoo("%5EGSPC")], "dxy": lambda: [x[1] for x in yahoo("DX-Y.NYB")],
           "tnx": lambda: [x[1] for x in yahoo("%5ETNX")], "vix": lambda: [x[1] for x in yahoo("%5EVIX")],
           "ry": lambda: fred("DFII10"), "be": lambda: fred("T10YIE"), "dgs2": lambda: fred("DGS2"), "dff": lambda: fred("DFF"),
           "cot_g": lambda: cftc("GOLD - COMMODITY EXCHANGE"), "cot_n": lambda: cftc("NASDAQ", "MINI"),
           "s_g": lambda: season("GC=F"), "s_n": lambda: season("%5ENDX")}
    for k, fn in src.items():
        try:
            D[k] = fn()
        except Exception as e:
            print(f"warning: {k} unavailable: {e}", file=sys.stderr)
            notes.append(f"{k}: source unavailable")
    if not any(D.get(k) for k in ("gold", "ndx")):
        print("error: no price data, leaving bias.json untouched", file=sys.stderr)
        sys.exit(1)
    ev = events_today()
    data = {"updated": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), "events_today": ev, "notes": notes, "assets": {}}
    for asset in ("XAUUSD", "NASDAQ"):
        px = D.get("gold" if asset == "XAUUSD" else "ndx")
        data["assets"][asset] = {"price": round(px[-1], 2) if px else None,
                                 "tf": {tf: build(asset, tf, D) for tf in TH}, "investors": investors(asset, D),
                                 "zones": zones_for(["GC=F"] if asset == "XAUUSD" else ["%5ENDX", "NQ=F"])}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", OUT, {a: {t: v["label"] for t, v in x["tf"].items()} for a, x in data["assets"].items()})


if __name__ == "__main__":
    main()
