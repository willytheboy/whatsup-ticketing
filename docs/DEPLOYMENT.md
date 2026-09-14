# Deployment

## Vercel (git-linked)

| Project | Root directory | Production URL | Notes |
| --- | --- | --- | --- |
| `whatsup-ticketing-app` | `app` | https://whatsup-ticketing-app.vercel.app | consumer + organiser + `/admin` (git-linked, project `prj_hMSiQzhwDnqaouNI28lNttxUk4M1`) |
| `whatsup-backoffice-app` | `app` | https://whatsup-backoffice-app.vercel.app | `/` → `/admin` via middleware (hostname match; git-linked, project `prj_6YWt2L2EgnaEtfR0f78CIun1q3bh`) |

Pushes to `main` on `willytheboy/whatsup-ticketing` deploy both projects.

The older manually-deployed projects `whatsup-ticketing` (prj_IhThFJSqR8Ny1r2CFlZCSnrL6fn8) and `whatsup-backoffice` (prj_oVIlFrwPCwvHGgBAMQiiDHNNT2UO) are not git-linked and still hold the short names (`whatsup-backoffice.vercel.app` currently serves a redirect to the `-app` host); delete them in the Vercel dashboard and rename the `-app` projects to reclaim `whatsup-ticketing.vercel.app` / `whatsup-backoffice.vercel.app` (the hostname check in `src/middleware.ts` already covers both names). `app/vercel.json` pins `framework: nextjs` so a fresh project builds correctly even before Vercel has auto-detected the framework. No environment variables are required for a green build; set them to override the defaults in `app/.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TENANT`, `NEXT_PUBLIC_APP_ROLE`, `NEXT_PUBLIC_BACKOFFICE_URL`). Add **`ANTHROPIC_API_KEY`** (and optionally `ANTHROPIC_MODEL`) to the ticketing project to switch the concierge, vibe creator and poster-to-listing from catalogue rules to Claude.

## Supabase

1. `supabase db push` (or paste `supabase/migrations/*.sql` in order into the SQL editor).
2. `supabase functions deploy create-order scan wa-otp-hook` and set secrets (`TICKET_SECRET`, `PAYMENTS_MODE=sandbox`, WhatsApp credentials for the OTP hook).
3. Auth → Hooks → *Send SMS*: point at `wa-otp-hook` and copy its secret to `SEND_SMS_HOOK_SECRET`. Enable phone sign-in to activate WhatsApp OTP; until then the login form falls back to email.
4. Run `supabase/seed/demo.sql` then `supabase/seed/demo_v2.sql` (multi-vertical demo listings, deals, a promoter, venue stations), create the first admin user in Auth, and insert their `super_admin` membership (instructions at the bottom of the seed file).

## Going live with payments

`create-order` runs in sandbox: card and Whish settle instantly, OMT and cash create reservations. Set `PAYMENTS_MODE=live` once a payment provider redirect is wired in (the function then returns `202 payment_redirect_not_configured` for card/Whish until that step exists).
