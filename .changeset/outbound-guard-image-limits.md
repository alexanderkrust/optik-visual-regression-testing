---
"@optik/api": minor
"@optik/core": minor
---

Security: optik no longer connects to loopback, link-local or cloud metadata addresses for notification webhooks, CI provider APIs and OIDC identity providers. The address is checked when connecting — for every redirect and after DNS changes — and such URLs are refused when saved; responses of failed calls are no longer shown or logged. Private networks stay allowed unless `OUTBOUND_ALLOW_PRIVATE=false`; `OUTBOUND_ALLOWED_HOSTS` lists exceptions (host names, `*.domain`, addresses, CIDR ranges). Screenshots are limited to `MAX_IMAGE_PIXELS` (default 50 megapixels), read from the PNG header before decoding, with a 400 for larger ones; `@optik/core` exports `pngSize`, `checkPngPixels` and `ImageTooLargeError`, and `computeDiff` / `diffImages` take a `maxPixels` option (same default). See docs/security.md.

Upgrade: if a webhook, CI system or identity provider runs on the optik host itself (`localhost`, `127.0.0.1`) or on a link-local address, add it to `OUTBOUND_ALLOWED_HOSTS`, e.g. `OUTBOUND_ALLOWED_HOSTS=localhost`. If you upload screenshots larger than 50 megapixels, raise `MAX_IMAGE_PIXELS`.
