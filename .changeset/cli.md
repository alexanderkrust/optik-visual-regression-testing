---
"@optik/cli": minor
"@optik/core": minor
"@optik/playwright": patch
"@optik/vitest": patch
---

New `@optik/cli`: `optik upload <dir>` uploads PNG screenshots from any tool as one run — names from the file paths, branch and commit detected like the adapters, a summary with the review link, and an exit code for CI. `@optik/core` gets `OptikClient`, the API client the adapters and the CLI now share; error messages include the server's reason.
