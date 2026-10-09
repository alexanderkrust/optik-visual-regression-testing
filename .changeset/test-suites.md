---
"@optik/api": minor
---

Test suites: every run belongs to a suite (`vitest` / `playwright` by default, configurable with the adapters' `suite` option). Runs are merged and baselines are kept per suite, so suites with equal snapshot names no longer interfere. Existing runs become the `default` suite, whose baselines other suites fall back to — reviews carry over. The web UI shows the suite of every run.
