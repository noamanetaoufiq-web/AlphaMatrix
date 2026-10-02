# Alpha Matrix

Structure (upload as-is to the repo root):

```
index.html                         the app (GitHub Pages serves this)
context.json                       auto market context (rewritten by the Action)
scripts/fetch_calendar.py          -> news.json   (USD calendar)
scripts/fetch_context.py           -> context.json (trend, USD/yields, seasonality, leading data)
.github/workflows/update-calendar.yml   runs both scripts every hour
```

First run: Actions tab -> "Update Market Calendar" -> Run workflow.
