# Alpha Matrix

Upload as-is to the repo root:

```
index.html                              the app
context.json                            auto market context (written by the Action)
scripts/fetch_calendar.py               -> news.json
scripts/fetch_context.py                -> context.json
scripts/notify_news.py                  -> Discord alert before high-impact news (+ alerts.json)
.github/workflows/update-calendar.yml   runs the 3 scripts every hour
```

First run: Actions -> "Update Market Calendar" -> Run workflow.
Discord alerts: Settings -> Secrets and variables -> Actions -> New repository secret
`DISCORD_NEWS_WEBHOOK` = webhook URL. Test: Run workflow with "test_alert" ticked.
