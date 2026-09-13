# Deployment

## Vercel (git-linked)

| Project | Root directory | Production URL | Notes |
| --- | --- | --- | --- |
| `whatsup-ticketing` | `app` | https://whatsup-ticketing.vercel.app | consumer + organiser + `/admin` |
| `whatsup-backoffice` | `app` | https://whatsup-backoffice.vercel.app | `/` → `/admin` via middleware (hostname match) |

Pushes to `main` on `willytheboy/whatsup-ticketing` deploy both projects. No environment variables are required for a green build; set them to override the defaults in `app/.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TENANT`, `NEXT_PUBLIC_APP_ROLE`, `NEXT_PUBLIC_BACKOFFICE_URL`).

## Supabase

1. `supabase db push` (or paste `supabase/migrations/*.sql` in order into the SQL editor).
2. `supabase functions deploy create-order scan wa-otp-hook` and set secrets (`TICKET_SECRET`, `PAYMENTS_MODE=sandbox`, WhatsApp credentials for the OTP hook).
3. Auth → Hooks → *Send SMS*: point at `wa-otp-hook` and copy its secret to `SEND_SMS_HOOK_SECRET`. Enable phone sign-in to activate WhatsApp OTP; until then the login form falls back to email.
4. Run `supabase/seed/demo.sql`, create the first admin user in Auth, and insert their `super_admin` membership (instructions at the bottom of the seed file).

## Going live with payments

`create-order` runs in sandbox: card and Whish settle instantly, OMT and cash create reservations. Set `PAYMENTS_MODE=live` once a payment provider redirect is wired in (the function then returns `202 payment_redirect_not_configured` for card/Whish until that step exists).
