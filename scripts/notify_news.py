#!/usr/bin/env python3
"""
Sends a Discord alert shortly BEFORE high-impact USD news (NFP, CPI, FOMC...).
Reads news.json + context.json (written by the other two scripts), applies the same
scenario model as the News page, and posts one embed per event (never twice: sent
events are remembered in alerts.json).

Setup: repo -> Settings -> Secrets and variables -> Actions -> New repository secret
  name: DISCORD_NEWS_WEBHOOK   value: the Discord webhook URL of the channel.
Test:  Actions -> Update Market Calendar -> Run workflow -> tick "test_alert".
Hourly runs => the alert lands roughly 25-75 minutes before the release.
"""
import datetime as dt
import json
import math
import os
import sys
import urllib.request
from zoneinfo import ZoneInfo

NEWS, CTX, SENT = "news.json", "context.json", "alerts.json"
WINDOW_MIN = 75
IMPACTS = {"High"}
SKIP_MODEL = ("FOMC", "Federal Funds", "Statement", "Minutes", "Speaks", "Press Conference")
APP_NAME = {"Non-Farm": "Non-Farm Payrolls", "CPI": "CPI Inflation"}


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def jround(x):  # JS Math.round
    return math.floor(x + 0.5)


def model(ctx, title):
    """Same maths as newsVerdict() in index.html."""
    ev = next((v for k, v in APP_NAME.items() if k in title), None)
    n = lambda k: float(ctx.get(k, 0) or 0)
    season = float((ctx.get("season") or {}).get(ev, 0) or 0) if ev else 0.0
    t = (n("f_lead") + season) / 2
    sh = jround(t * 20)
    strong, weak, inl = 30 + sh, 30 - sh, 40
    g = max(-1.0, min(1.0, (-n("f_usd") + n("f_trend")) / 2 + n("f_gs") * 0.25))
    bear = jround(strong + inl * (0.5 - 0.125 * g))
    bull = 100 - bear
    diff = abs(bear - bull)
    d = "BEARISH" if bear > bull else "BULLISH"
    lvl = "NO EDGE" if diff < 6 else f"SLIGHT {d} LEAN" if diff <= 15 else f"MODERATE {d} LEAN" if diff <= 30 else f"STRONG {d} LEAN"
    br, bl = [], []
    for v, bt, lt in ((n("f_lead"), "Leading data hot", "Leading data soft"), (season, "Release seasonality hot", "Release seasonality soft"),
                      (n("f_usd"), "USD & yields strong", "USD & yields weak"), (-n("f_trend"), "Gold trend bearish", "Gold trend bullish"),
                      (-n("f_gs"), "Gold seasonality weak", "Gold seasonality strong")):
        (br if v > 0 else bl if v < 0 else []).append(bt if v > 0 else lt)
    return dict(strong=strong, inl=inl, weak=weak, bear=bear, bull=bull, lvl=lvl, br=br, bl=bl, diff=diff)


def embed(ev, mins, ctx):
    ma = ZoneInfo("Africa/Casablanca")
    when = dt.datetime.fromisoformat(ev["date"]).astimezone(ma)
    desc = f"🕒 **{when:%H:%M}** (Morocco) · in ~{mins} min\nForecast: **{ev.get('forecast') or 'n/a'}** · Previous: **{ev.get('previous') or 'n/a'}**"
    fields, color = [], 9807270
    if ev.get("forecast") and not any(k in ev["title"] for k in SKIP_MODEL):
        m = model(ctx, ev["title"])
        color = 9807270 if m["diff"] < 6 else 15158332 if m["bear"] > m["bull"] else 3066993
        fields = [
            {"name": f"Gold lean · {m['lvl']} ({max(m['bear'], m['bull'])}% / {min(m['bear'], m['bull'])}%)",
             "value": f"Above forecast (bearish) **{m['strong']}%** · In line **{m['inl']}%** · Below (bullish) **{m['weak']}%**"},
            {"name": "Bear case", "value": "\n".join("• " + x for x in m["br"]) or "—", "inline": True},
            {"name": "Bull case", "value": "\n".join("• " + x for x in m["bl"]) or "—", "inline": True},
        ]
    return {"title": f"⚠️ {ev.get('impact', '').upper()} NEWS · {ev['title']}", "description": desc, "color": color, "fields": fields,
            "footer": {"text": "Subjective model, not financial advice. Wait for the print and the first reaction."},
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat()}


def post(url, emb):
    req = urllib.request.Request(url, data=json.dumps({"username": "Alpha Matrix News", "embeds": [emb]}).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "User-Agent": "AlphaMatrix/1.0"})
    urllib.request.urlopen(req, timeout=20).read()


def main():
    url = os.environ.get("DISCORD_NEWS_WEBHOOK", "").strip()
    if not url:
        print("DISCORD_NEWS_WEBHOOK not set - skipping alerts")
        return
    ctx, news, sent = load(CTX, {}), load(NEWS, []), load(SENT, {})
    now = dt.datetime.now(dt.timezone.utc)
    if os.environ.get("NEWS_ALERT_TEST") == "1":
        sample = next((e for e in news if e.get("impact") in IMPACTS), {"title": "Non-Farm Employment Change", "impact": "High", "date": now.isoformat(), "forecast": "73K", "previous": "38K"})
        emb = embed(sample, 60, ctx)
        emb["title"] = "🧪 TEST · " + emb["title"]
        post(url, emb)
        print("test alert sent")
        return
    changed = False
    for ev in news:
        if ev.get("impact") not in IMPACTS:
            continue
        key = f"{ev['title']}|{ev['date']}"
        mins = (dt.datetime.fromisoformat(ev["date"]) - now).total_seconds() / 60
        if key in sent or not (0 < mins <= WINDOW_MIN):
            continue
        try:
            post(url, embed(ev, int(mins), ctx))
            sent[key] = now.strftime("%Y-%m-%d")
            changed = True
            print("alert sent:", key)
        except Exception as e:
            print(f"warning: discord post failed for {key}: {e}", file=sys.stderr)
    cut = (now - dt.timedelta(days=14)).strftime("%Y-%m-%d")
    pruned = {k: v for k, v in sent.items() if v >= cut}
    if changed or pruned != sent:
        with open(SENT, "w", encoding="utf-8") as f:
            json.dump(pruned, f, indent=2)
            f.write("\n")


if __name__ == "__main__":
    main()
