# Architecture

## Runtime

* **Next.js 14.2 (App Router)** in `app/`. Public pages (`/`, `/e/[slug]`) are server components that read from Supabase with the anon key; everything behind sign-in is a client component using `@supabase/ssr`'s browser client (session in cookies).
* **Supabase** project `xhwmgnhspyaqsgggvujo` (Postgres 17, eu-central-1): schema + RLS + SQL functions, three Deno edge functions, Realtime for room chat, pg_cron for the hold sweeper and weekly payouts.
* **Vercel**: `whatsup-ticketing` and `whatsup-backoffice`, both with root directory `app/`. `middleware.ts` redirects `/` → `/admin` on the back-office host.
* **i18n**: English / Lebanese Arabic dictionary in `src/lib/i18n.ts`; the `lang` cookie drives `<html lang dir>` (server) and `useT()` (client); the `city` cookie scopes Home. System font stack only (the brief: render offline and from a local file on iOS Safari).
* **Design system**: `src/app/globals.css` carries the tokens and components of Design Brief v1.0 (white canvas, cedar greens g1–g4, rationed red, facet band, 14/10/999/18 radii). See `docs/DESIGN.md`.
* **AI layer**: `/api/ai` (server route) — concierge, vibe creator and poster-to-listing extraction. Calls Claude when `ANTHROPIC_API_KEY` is set, with the live catalogue as the only source of truth (the model must end with `OPEN: <exact title>`, resolved to a slug here); otherwise answers from the catalogue with plain rules so every screen still works.
* **Time zone**: everything is displayed in `Asia/Beirut` (`TZ` in `src/lib/config.ts`).

## Roles (`memberships.role`)

`buyer` (implicit) · `organiser` (events, tiers, finance) · `door` (scanner) · `promoter` (attribution links) · `country_admin` / `super_admin` (back office, `is_tenant_admin()`).
Partner portal access (`/org/finance`) additionally comes from `partner_members`.

## Key tables

| Area | Tables / views |
| --- | --- |
| Catalogue | `tenants`, `organisers` (+ `plan`, `plan_until`), `venues` (+ `lat`, `lng`), `events` (+ `kind`, `cover_url`, `deals`, `pinned`, `featured_until`), `tiers` (+ `kind`, `member_free`, `plan_months`, `note`), `tables_vip`, `promo_codes`, `promoters`, `saved_deals`, `moments` (+ storage bucket `moments`) |
| Sales | `orders`, `order_lines`, `tickets`, `scans`, `waitlist`, `message_log`, `payouts`, `promotion_orders` |
| Ledger | `partners`, `accounts`, `journals`, `journal_lines`, `revenue_share_rules`, `service_charges`, `settlements`, `invoices`, `doc_sequences`, `provider_batches`, `provider_transactions`, `audit_log` |
| Live | `streams`, `stream_passes`, `chat_rooms`, `chat_messages` |
| Views | `organiser_event_stats`, `organiser_daily_sales`, `promoter_stats`, `v_partner_balances`, `v_partner_ledger`, `v_account_balances`, `v_platform_pnl`, `v_admin_orders`, `v_admin_journals`, `v_admin_daily`, `v_admin_members`, `v_unreconciled_orders`, `v_streams`, `v_chat_messages` |

## Flows

1. **Checkout** — `OfferPicker` (pickers by offer type: stepper, party size + time slots, nights + check-in, plan cards, Save) stores the cart in `sessionStorage` → `/checkout` signs the buyer in (email/password or WhatsApp OTP) → `create-order` edge function (per-kind fees, per-tier limits, pass coverage of `member_free` offers, promoter / referral attribution, holds → order → tickets → confirm; passes get `valid_until`, table bookings get a QR too) → `/t/[code]` shows the ticket card and the wallet keeps it.
2. **Door** — `/org/door` scans with `BarcodeDetector` (or pasted token) → `scan` edge function → `VALID` / `ALREADY SCANNED` / `PAY AT DOOR` / `INVALID`; member cards (pass tiers) scan every visit at any partner venue until `valid_until`.
7. **Upgrade ladder** — `upgrade_plan(organiser, 'pro')` posts a `service_charges` row (kind `organiser_plan`) and sets `organisers.plan` for 30 days; `buy_promotion(event, package)` inserts a paid `promotion_orders` row (ledger: `rev:promotions` + share rules) and extends `events.featured_until` so Home puts the listing first; `event_room(event)` creates the listing's chat room on first open.
3. **Ledger** — `orders_ledger_trigger` → `post_order()` posts collected cash (clearing or organiser receivable for door cash), organiser payable, platform revenue, processing recovery; then promoter commission and revenue-share rules. Refunds reverse the journals.
4. **Settlement** — `generate_settlements(start,end)` computes each partner's net balance, creates a settlement (and an invoice when the partner owes WhatsUp). `mark_settlement_paid()` posts bank ↔ payable/receivable.
5. **Reconciliation** — `import_provider_batch()` loads acquirer statements; `reconcile_batch()` matches by `payment_ref`/order id and posts bank + provider fees when clean.
6. **Live** — venues stream (HLS / YouTube / URL) with public, ticket-holder or paid-pass access (`buy_stream_pass()` posts a service charge with a 70% venue share); `chat_messages` stream through Supabase Realtime.
