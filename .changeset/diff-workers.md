---
"@optik/api": minor
---

Screenshots are decoded and diffed in a pool of worker threads (`DIFF_WORKERS`, default: CPU cores, at most 4). The API stays responsive while large screenshots are compared, and several diffs run in parallel — 8 large full-page diffs went from 16.2 s to 3.7 s, with the API blocked for at most 44 ms instead of 5 s.
