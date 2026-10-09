---
"@optik/api": patch
---

Refresh tokens are stored as SHA-256 hashes; existing sessions stay valid. Expired refresh tokens are cleaned up when a user signs in.
