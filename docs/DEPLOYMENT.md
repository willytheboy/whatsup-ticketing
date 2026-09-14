# Deployment

## Vercel (git-linked)

| Project | Root directory | Production URL | Notes |
| --- | --- | --- | --- |
| `whatsup-ticketing-app` | `app` | https://whatsup-ticketing-app.vercel.app | consumer + organiser + `/admin` (git-linked, project `prj_hMSiQzhwDnqaouNI28lNttxUk4M1`) |
| `whatsup-backoffice-app` | `app` | https://whatsup-backoffice-app.vercel.app | `/` → `/admin` via middleware (hostname match; git-linked, project `prj_6YWt2L2EgnaEtfR0f78CIun1q3bh`) |

Pushes to `main` on `willytheboy/whatsup-ticketing` deploy both projects.

The older manually-deployed projects `whatsup-ticketing` (prj_IhThFJSqR8Ny1r2CFlZCSnrL6fn8) and `whatsup-backoffice` (prj_oVIlFrwPCwvHGgBAMQiiDHNNT2UO) are not git-linked and still hold the short names (`whatsup-backoffice.vercel.app` currently serves a redirect to the `-app` host); delete them in the Vercel dashboard and rename the `-app` projects to reclaim `whatsup-ticketing.vercel.app` / `whatsup-backoffice.vercel.app` (the hostname check in `src/middleware.ts` already covers both names). `app/vercel.json` pins `framework: nextjs` so a fresh project builds correctly even before Vercel has auto-detected the framework. No environment variables are required for a green build; set them to override the defaults in `app/.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TENANT`, `NEXT_PUBLIC_APP_ROLE`, `NEXT_PUBLIC_BACKOFFICE_URL`, `NEXT_PUBLIC_APP_URL` — the last one is what the back office's "Preview in the app" links open). Add **`ANTHROPIC_API_KEY`** (and optionally `ANTHROPIC_MODEL`) to the ticketing project to switch the concierge, vibe creator and poster-to-listing from catalogue rules to Claude.

## Supabase

1. `supabase db push` (or paste `supabase/migrations/*.sql` in order into the SQL editor).
2. `sh supabase/sync-lib.sh && supabase functions deploy create-order pay payment-webhook scan wallet notify wa-otp-hook` (deploy `payment-webhook` and `notify` with `--no-verify-jwt`: providers and pg_cron call them without a user session) and set secrets — the full list is at the bottom of `app/.env.example`. Minimum: `TICKET_SECRET`, `APP_URL`, `PAYMENTS_MODE=sandbox`, `NOTIFY_SECRET`.
3. Auth → Hooks → *Send SMS*: point at `wa-otp-hook` and copy its secret to `SEND_SMS_HOOK_SECRET`. Enable phone sign-in to activate WhatsApp OTP; until then the login form falls back to email.
4. Run `supabase/seed/demo.sql` then `supabase/seed/demo_v2.sql` (multi-vertical demo listings, deals, a promoter, venue stations), create the first admin user in Auth, and insert their `super_admin` membership (instructions at the bottom of the seed file).

5. Messaging: `insert into app_settings values ('notify_url','https://<ref>.supabase.co/functions/v1/notify'), ('notify_secret','<same as NOTIFY_SECRET>')` — pg_cron then drains `message_log` every five minutes. Without `WHATSAPP_TOKEN` the queue is rendered and marked `sandbox` (visible in the back office); with it, messages go out through the templates in `docs/WHATSAPP-TEMPLATES.md`.

## Tenant settings (v0.7)

What the client app shows is data, not a deploy: **Back office → Settings** writes `tenants.config` (`theme`, `tabs`, `features`) and `tenants.brand`; the app reads them on every request (`lib/features-server.ts`) and passes them to client components (`components/Config.tsx`). An empty config is v0.6 behaviour. To move the whole configuration to another install, copy those two columns. The rebrand checklist is in `docs/DESIGN.md`.

## Going live with payments

`create-order` runs in sandbox: card and Whish settle instantly, OMT and cash create reservations. To take real money set `PAYMENTS_MODE=live` and `PAYMENTS_PROVIDER` (`stripe`, `areeba` or `whish`) with that provider's credentials on the `pay` and `payment-webhook` functions; card/Whish orders are then created `pending`, the app sends the buyer to `/checkout/pay` → the provider's hosted page, and `payment-webhook` (Stripe webhook, Areeba return URL, Whish callback) confirms with the provider before issuing tickets. Point the provider at `https://<ref>.supabase.co/functions/v1/payment-webhook?provider=<name>`.

## Credentials still needed for full production

| Capability | Where | Keys |
| --- | --- | --- |
| Card payments | `pay`, `payment-webhook` secrets | `PAYMENTS_PROVIDER=areeba` + `AREEBA_MERCHANT_ID`, `AREEBA_API_PASSWORD`, `AREEBA_GATEWAY_URL` (or Stripe) |
| Whish Money | same | `WHISH_CHANNEL`, `WHISH_SECRET`, `WHISH_WEBSITE_URL` |
| WhatsApp delivery and OTP | `notify`, `wa-otp-hook` secrets | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, approved templates (`WA_TPL_*`), `SEND_SMS_HOOK_SECRET` |
| Email copies | `notify` secrets | `RESEND_API_KEY`, `EMAIL_FROM` |
| AI layer | Vercel env | `ANTHROPIC_API_KEY` |
| Live streaming | organiser dashboard | an HLS/audio stream URL per station (Mux / Cloudflare Stream / Icecast) |
| Native wallet passes | not built | Apple Pass Type ID certificate, Google Wallet issuer |
