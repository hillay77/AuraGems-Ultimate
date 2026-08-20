# AuraGems Ultimate

Dynamic original luxury e-commerce website benchmarked on the catalogue breadth and merchandising patterns visible on Millennium Infosys: New Arrivals, offers with old/current prices, category discovery, product grids, add-to-cart and service assurances. It does not copy third-party code, text, branding or assets.

## Local development
```powershell
npm.cmd install
npm.cmd start
```
Store: `http://localhost:3000`  
Admin: `http://localhost:3000/admin`

Development mode uses `data/store.json` and marks orders `Dev pending` when Flutterwave is not configured. This JSON fallback is not suitable for production.

## Production setup

1. Provision PostgreSQL and set `NODE_ENV=production`, `DATABASE_URL`, a strong `JWT_SECRET`, `ADMIN_EMAIL`, and strong `ADMIN_PASSWORD`.
2. Set `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, and `PUBLIC_URL`. Production startup fails closed when these values or PostgreSQL are missing.
3. Run `npm.cmd run migrate:json` once to copy the current JSON catalogue/state into PostgreSQL.
4. Run `npm.cmd start` behind HTTPS and a reverse proxy. Set `PGSSL` appropriately for the provider.
5. Configure Flutterwave webhook URL `https://YOUR_DOMAIN/api/payments/flutterwave/webhook`; the webhook secret must match `FLUTTERWAVE_WEBHOOK_SECRET`.

Flutterwave payment is initialized during order creation, but an order remains pending until server-side transaction verification succeeds. Public tracking requires the private token returned once at checkout and never returns customer details.

Cloudinary uploads are used when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are configured. Local uploads are permitted only outside production; production rejects uploads unless Cloudinary is configured.

## Checks

```powershell
npm.cmd test
node --check secure-server.js
node --check lib/config.js
node --check lib/storage.js
node --check lib/payment.js
```

## Launch checklist

- Configure HTTPS, DNS, backups, PostgreSQL monitoring, logs, and a process manager/container restart policy.
- Register the business, payment settlement account, refund process, delivery coverage/pricing, stock reconciliation, and customer support escalation.
- Publish privacy, terms, returns/refunds, delivery, contact, and cookie notices appropriate to Uganda and the markets served.
- Confirm Flutterwave test/live keys, webhook delivery, amount/currency checks, duplicate webhooks, refunds, and settlement reconciliation.
- Review catalogue image licences, tax/receipt obligations, admin ownership, password rotation, and incident procedures.

Do not commit `.env` or live credentials. No git commit is required for these changes.
