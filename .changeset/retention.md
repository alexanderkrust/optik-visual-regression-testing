---
"@optik/api": minor
"@optik/shared": minor
---

Storage usage per project (image sizes are recorded; older images are measured by a new daily maintenance job) and retention policies (Enterprise): runs older than a project's retention period are removed with their images, while every baseline stays. The daily job runs on one instance at a time.
