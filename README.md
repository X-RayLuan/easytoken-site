# EasyToken (easytoken.si)

One Cloudflare Worker serves the static site and the API.

- `/v1/*` — public API, `Authorization: Bearer et_live_…` (also on `api.easytoken.si`)
- `/api/*` — dashboard API, HttpOnly session cookie
- everything else — static files in this folder

Code: `worker/` (index = router, auth, tasks = media tasks + refunds + webhooks, chat, billing = Stripe, kie = upstream client, catalog = prices + upstream mapping). Schema: `migrations/`. Prices shown on the site live in `assets/data.js` and must match `worker/catalog.js`; `node --test tests/` checks this and runs in CI.

Money is stored in micro-dollars. A task debits the balance when created and is refunded automatically if it fails, never starts, or runs over 2 hours. A cron job runs every minute to poll open tasks and retry customer webhooks.

## Secrets

```
wrangler secret put KIE_API_KEY            # media upstream
wrangler secret put INTERNAL_SECRET        # signs kie callback URLs (any long random string)
wrangler secret put CHAT_UPSTREAM_KEY      # OpenRouter key; chat returns 503 until set
wrangler secret put STRIPE_SECRET_KEY      # top-ups return 503 until set
wrangler secret put STRIPE_WEBHOOK_SECRET  # endpoint: https://easytoken.si/api/stripe/webhook (checkout.session.completed)
```

## Local dev

```
echo "KIE_API_KEY=…\nINTERNAL_SECRET=dev\nPUBLIC_ORIGIN=http://localhost:8787" > .dev.vars
npx wrangler@4.20.0 d1 migrations apply easytoken --local --persist-to ../.et-state
npx wrangler@4.20.0 dev --persist-to ../.et-state   # keep state outside this folder or the watcher reloads on every write
```

Grant credits by hand: `wrangler d1 execute easytoken --remote --command "UPDATE users SET balance = balance + 10000000 WHERE email = '…'"` (and add a matching `ledger` row with kind `adjust`).
