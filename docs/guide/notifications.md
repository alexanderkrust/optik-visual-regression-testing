# Notifications

Maintainers add channels under *Project → Settings → Notifications*. Each channel gets one or both events:

| Event | When |
|---|---|
| `run.needs_review` | a run finished with visual changes to review |
| `run.reviewed` | the last pending change of a run was accepted or rejected |

| Channel | Target |
|---|---|
| **Slack** | an [incoming webhook](https://api.slack.com/messaging/webhooks) URL |
| **Microsoft Teams** | a *Workflows* webhook URL ("Post to a channel when a webhook request is received") |
| **E-mail** | one or more addresses; needs `SMTP_URL` on the server |
| **Webhook** | any HTTP(S) URL — receives JSON |

URLs are stored encrypted and shown shortened. *Send test* checks a channel. Delivery is best effort: a failing receiver is logged, not retried.

Webhooks get a `POST` with the headers `X-Optik-Event` and `X-Optik-Signature: sha256=<hex>` — an HMAC-SHA256 of the raw body with the channel's secret, which is shown once when the channel is created:

```json
{
  "event": "run.needs_review",
  "project": { "slug": "shop", "name": "Shop" },
  "run": { "id": "…", "branch": "feature/cart", "suite": "vitest", "commitSha": "…", "pendingCount": 2, "changedCount": 2 },
  "reviewUrl": "https://optik.example.com/shop/…"
}
```

```js
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
const received = Buffer.from(req.headers['x-optik-signature'] ?? '');
const valid = received.length === expected.length && crypto.timingSafeEqual(received, Buffer.from(expected));
```

Links point to `PUBLIC_URL`, or else to the URL the adapters used (`OPTIK_SERVER_URL`).
