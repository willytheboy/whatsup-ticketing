# Deployment

## Vercel (git-linked)

| Project | Root directory | Hostnames | Notes |
| --- | --- | --- | --- |
| `whatsup-ticketing` | `app` | https://whatsup-ticketing-app.vercel.app (domain record) · https://whatsup-ticketing.vercel.app (alias) | consumer + organiser + `/admin` (git-linked, project `prj_hMSiQzhwDnqaouNI28lNttxUk4M1`) |
| `whatsup-backoffice` | `app` | https://whatsup-backoffice-app.vercel.app (domain record) · https://whatsup-backoffice.vercel.app (alias) | `/` → `/admin` via middleware (hostname match; git-linked, project `prj_6YWt2L2EgnaEtfR0f78CIun1q3bh`) |

Pushes to `main` on `willytheboy/whatsup-ticketing` deploy both projects.

**Short names (15 Nov 2026).** The git-linked projects were renamed from `whatsup-ticketing-app` / `whatsup-backoffice-app` to the short names. The older manually-deployed projects are now `whatsup-ticketing-legacy` (`prj_IhThFJSqR8Ny1r2CFlZCSnrL6fn8`) and `whatsup-backoffice-legacy` (`prj_oVIlFrwPCwvHGgBAMQiiDHNNT2UO`). Renaming a Vercel project does not move its `<name>.vercel.app` domain, so the legacy projects still own the domain records `whatsup-ticketing.vercel.app` and `whatsup-backoffice.vercel.app`, and Vercel refuses to add them to another project (`409 duplicate-team-registration`). Until those records move, both short hosts are aliases set by hand on the current production deployments: they serve the live app but **do not follow new pushes**. After a code push, re-point them (dashboard → deployment → Assign domain, or `assign_alias` with the new production deployment id).

To finish: delete the two `-legacy` projects in the dashboard (Settings → General → Delete Project), then add `whatsup-ticketing.vercel.app` and `whatsup-backoffice.vercel.app` as domains of the git-linked projects (Settings → Domains, or `add_project_domain`). From then on every push updates the short hosts. The `-app` hosts stay attached and keep working, so they remain the code defaults (`NEXT_PUBLIC_BACKOFFICE_URL`, `NEXT_PUBLIC_APP_URL`, the functions' `APP_URL`); the hostname check in `src/middleware.ts` already covers both names.

`app/vercel.json` pins `framework: nextjs` so a fresh project builds correctly even before Vercel has auto-detected the framework. No environment variables are required for a green build; set them to override the defaults in `app/.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TENANT`, `NEXT_PUBLIC_APP_ROLE`, `NEXT_PUBLIC_BACKOFFICE_URL`, `NEXT_PUBLIC_APP_URL` — the last one is what the back office's "Preview in the app" links open). Add **`ANTHROPIC_API_KEY`** (and optionally `ANTHROPIC_MODEL`) to the ticketing project to switch the concierge, vibe creator and poster-to-listing from catalogue rules to Claude.

## Supabase

1. `supabase db push` (or paste `supabase/migrations/*.sql` in order into the SQL editor).
2. `sh supabase/sync-lib.sh && supabase functions deploy create-order pay payment-webhook scan wallet notify wa-otp-hook wa-inbound` (deploy `payment-webhook`, `notify` and `wa-inbound` with `--no-verify-jwt`: providers, pg_cron and Meta call them without a user session) and set secrets — the full list is at the bottom of `app/.env.example`. Minimum: `TICKET_SECRET`, `APP_URL`, `PAYMENTS_MODE=sandbox`, `NOTIFY_SECRET`.
3. Auth → Providers → Email (v0.9.1): buyers create an account with email and password in the app, and reset a forgotten password by email. Supabase's built-in mailer only delivers to members of the project's team, so for real customers either set custom SMTP (Auth → SMTP, e.g. Resend) or turn off *Confirm email*; and add the app hosts with `/**` to Auth → URL Configuration → Redirect URLs so confirmation and reset links come back to the app.
   Auth → Hooks → *Send SMS*: point at `wa-otp-hook` and copy its secret to `SEND_SMS_HOOK_SECRET`. Enable phone sign-in to activate WhatsApp OTP; until then the login form falls back to email.
4. Run `supabase/seed/demo.sql` then `supabase/seed/demo_v2.sql` (multi-vertical demo listings, deals, a promoter, venue stations), create the first admin user in Auth, and insert their `super_admin` membership (instructions at the bottom of the seed file).
   Demo events are dated; when they have passed, `supabase/seed/refresh_demo_dates.sql` moves them forward by whole weeks (same weekday and local time). It is safe to re-run.

5. Messaging: `insert into app_settings values ('notify_url','https://<ref>.supabase.co/functions/v1/notify'), ('notify_secret','<same as NOTIFY_SECRET>')` — pg_cron then drains `message_log` every five minutes. Without `WHATSAPP_TOKEN` the queue is rendered and marked `sandbox` (visible in the back office); with it, messages go out through the templates in `docs/WHATSAPP-TEMPLATES.md`.

## Several countries on one deployment (v0.8)

`TENANT_HOSTS` (JSON `{"host":"slug"}`) or `TENANT_BASE_HOST` (subdomain = slug) on the Vercel project maps hostnames to tenants; unmapped hosts serve `NEXT_PUBLIC_TENANT`. The full go-live runbook for a second country is `docs/SECOND-COUNTRY.md`.

## Tenant settings (v0.7)

What the client app shows is data, not a deploy: **Back office → Settings** writes `tenants.config` (`theme`, `tabs`, `features`) and `tenants.brand`; the app reads them on every request (`lib/features-server.ts`) and passes them to client components (`components/Config.tsx`). An empty config is v0.6 behaviour. To move the whole configuration to another install, copy those two columns. The rebrand checklist is in `docs/DESIGN.md`.

## Going live with payments

`create-order` runs in sandbox: card and Whish settle instantly, OMT and cash create reservations. To take real money set `PAYMENTS_MODE=live` and `PAYMENTS_PROVIDER` (`stripe`, `areeba` or `whish`) with that provider's credentials on the `pay` and `payment-webhook` functions; card/Whish orders are then created `pending`, the app sends the buyer to `/checkout/pay` → the provider's hosted page, and `payment-webhook` (Stripe webhook, Areeba return URL, Whish callback) confirms with the provider before issuing tickets. Point the provider at `https://<ref>.supabase.co/functions/v1/payment-webhook?provider=<name>`.

## Credentials still needed for full production

| Capability | Where | Keys |
| --- | --- | --- |
| Card payments | `pay`, `payment-webhook` secrets | `PAYMENTS_PROVIDER=areeba` + `AREEBA_MERCHANT_ID`, `AREEBA_API_PASSWORD`, `AREEBA_GATEWAY_URL` (or Stripe) |
| Whish Money | same | `WHISH_CHANNEL`, `WHISH_SECRET`, `WHISH_WEBSITE_URL` |
| WhatsApp delivery and OTP | `notify`, `wa-otp-hook` secrets | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, approved templates (`WA_TPL_*`), `SEND_SMS_HOOK_SECRET`, `NOTIFY_SECRET` |
| WhatsApp selling (inbound concierge) | `wa-inbound` secrets + Meta webhook | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, optional `ANTHROPIC_API_KEY` |
| Email copies | `notify` secrets | `RESEND_API_KEY`, `EMAIL_FROM` |
| AI layer | Vercel env | `ANTHROPIC_API_KEY` |
| Live streaming | organiser dashboard | an HLS/audio stream URL per station (Mux / Cloudflare Stream / Icecast) |
| Native wallet passes | not built | Apple Pass Type ID certificate, Google Wallet issuer |
