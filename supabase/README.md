# supabase/

Database layer for WhatsUp Ticketing. Project ref: `xhwmgnhspyaqsgggvujo` (eu-central-1).

| Folder | Contents |
| --- | --- |
| `migrations/` | The eight migrations applied to the project, in order (core schema, sweeper + payouts, security-invoker views, partners + double-entry ledger, two reconcile fixes, back office, build-artifacts helper). |
| `functions/` | Edge functions: `create-order` (checkout, holds, tickets), `scan` (door check-in), `wa-otp-hook` (Auth "Send SMS" hook that delivers OTPs on WhatsApp). `_shared_lib.ts` is the canonical helper copied into each function as `lib.ts`. |
| `seed/demo.sql` | Demo tenant, organiser, venues, six events, tiers, VIP tables and the `WHATSUP10` promo code. |

Apply with the Supabase CLI (`supabase db push`, `supabase functions deploy <name>`) or through the dashboard SQL editor.
Edge function secrets: `TICKET_SECRET`, `PAYMENTS_MODE` (`sandbox` by default), and for the OTP hook `SEND_SMS_HOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_OTP_TEMPLATE`.
Scheduled jobs (pg_cron): `expire-holds` every minute, `weekly-payouts` Mondays 06:00 UTC.
