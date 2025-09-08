SEO Tool (ClickRank.ai style)

Quick start
- Copy `.env.example` to `.env.local` and fill creds.
- Install deps: `npm i` inside `web/` and run `npm run dev`.

Environment variables
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth credentials.
- `NEXTAUTH_SECRET`: random string for NextAuth.
- `ENABLE_PAYMENTS`: `true` to enable PayPal checkout. Off in dev.
- `ALLOW_FREE_ACCESS`: `true` to show a temporary bypass button.
- `PAYPAL_CLIENT_ID`: PayPal REST client ID. Use Sandbox for testing.

Routes
- `/login` – Google sign in and dev bypass.
- `/pricing` – Plan selection, PayPal button and bypass.
- `/dashboard` – Protected dashboard with sidebar, KPIs and demo charts.
- `/optimize`, `/performance`, `/keywords`, `/audit`, `/reports`, `/websites` – Section placeholders.

