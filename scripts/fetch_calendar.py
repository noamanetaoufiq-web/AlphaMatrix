#!/usr/bin/env python3
"""
Fetches the public ForexFactory economic calendar (this week + next week),
keeps only medium/high impact USD releases, and writes a small news.json
into the repo. Run on a schedule by .github/workflows/update-calendar.yml.

This mirrors an unofficial-but-widely-used public feed (nfs.faireconomy.media).
It can go away or change shape without notice, so every network/parse error
is caught per-source: the script degrades to whatever sources succeeded
rather than failing the whole run.
"""
import json
import sys
import urllib.request

SOURCES = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]
KEEP_IMPACT = {"High", "Medium"}
KEEP_COUNTRY = {"USD"}
OUTPUT_PATH = "news.json"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    seen = set()
    merged = []
    any_ok = False

    for url in SOURCES:
        try:
            items = fetch(url)
        except Exception as e:
            print(f"warning: failed to fetch {url}: {e}", file=sys.stderr)
            continue
        any_ok = True
        for it in items:
            if it.get("country") not in KEEP_COUNTRY:
                continue
            if it.get("impact") not in KEEP_IMPACT:
                continue
            key = (it.get("title"), it.get("date"))
            if key in seen:
                continue
            seen.add(key)
            merged.append(
                {
                    "title": it.get("title", ""),
                    "country": it.get("country", ""),
                    "date": it.get("date", ""),
                    "impact": it.get("impact", ""),
                    "forecast": it.get("forecast", ""),
                    "previous": it.get("previous", ""),
                    "actual": it.get("actual", ""),
                }
            )

    if not any_ok:
        # every source failed - don't overwrite a good file with an empty one
        print("error: all sources failed, leaving existing news.json untouched", file=sys.stderr)
        sys.exit(1)

    merged.sort(key=lambda x: x["date"])

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"wrote {len(merged)} USD medium/high-impact events to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
