ClickBloom

Overview
- ClickBloom helps you audit, optimize, and monitor SEO performance.
- Integrates with Google Search Console for insights and with WordPress (via a small connector plugin) to publish changes live.

Quick start
- Copy `.env.example` to `web/.env.local` and fill credentials.
- From `web/`, install deps and start dev: `npm install && npm run dev`.

Environment variables
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth credentials.
- `NEXTAUTH_SECRET`: random string for NextAuth.
- `ENABLE_PAYMENTS` (optional): `true` to enable PayPal checkout.
- `ALLOW_FREE_ACCESS` (dev): `true` to show a temporary bypass button.
- `PAYPAL_CLIENT_ID` (optional): PayPal REST client ID.

WordPress integration
- Install the ClickBloom connector plugin on your site (receives updates to title/meta/canonical/schema/image alts).
- In ClickBloom, use Quick Connect to save your site’s endpoint URL and token.
- Use Optimize to apply changes; the app calls your WP endpoint to update the post.

Routes
- `/login` — Google sign in and optional guest access.
- `/dashboard` — Protected dashboard.
- `/optimize`, `/performance`, `/keywords`, `/audit`, `/reports`, `/websites` — main sections.
## SQL cache (local + cPanel)

This repo now supports MySQL/MariaDB for caching snapshots and generic key/value data used by the app.

### Local (Docker)

1. `docker-compose up -d`
2. Set env (in `.env.local`):

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=clickbloom
MYSQL_USER=clickbloom
MYSQL_PASSWORD=clickbloom
```

3. Run migration:

```
cd web
npm run db:migrate
```

4. Start the app (`npm run dev`), the `/api/cache/clients` route now reads/writes to MySQL.

### cPanel

- Create a MySQL database and user; copy credentials to `.env.local` (or your hosting env editor).
- Upload `web/db/schema.sql` to run once, or use `npm run db:migrate` if Node is available on the host.

### What uses SQL

- `/api/cache/clients` will prefer MySQL; falls back to Upstash (if configured) or in‑memory.
- Table `kv_cache` stores JSON values with optional TTL.

