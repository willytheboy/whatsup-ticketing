# Second country — go-live runbook

WhatsUp [Country] editions share one codebase, one database and one back office. A country is a **tenant**: its own currency, fees, payment methods, partners, ledger, feed, theme, tabs, features and brand words. This is the order of operations to open one, whether it is a WhatsUp edition (Jordan, Cyprus, Egypt…) or a white-label install run by someone else.

## 1. Create the tenant (10 minutes)

Back office → **Tenants → New tenant**: slug (`jo`), name (`What's Up Jordan`), country EN/AR, base currency (`JOD`), display currency, FX, the country admin's email, "Live now" off (it shows as *coming soon* on the city sheet until you flip it). This calls `create_tenant()`, which also creates the admin membership.

Then **Settings** (as that tenant's admin): theme, bottom tabs, features, brand words. Nothing else needs code.

## 2. Give it a hostname (5 minutes)

One ticketing deployment can serve every country. The middleware maps the hostname to the tenant:

* `TENANT_HOSTS` (Vercel env, JSON): `{"whatsup-jo.vercel.app":"jo","whatsup.jo":"jo","yalla.cy":"cy"}`
* or `TENANT_BASE_HOST=wul.app` so `jo.wul.app`, `cy.wul.app` resolve by subdomain.
* A host that matches nothing serves `NEXT_PUBLIC_TENANT` (the one-country setup, `lb` today).

Add the domain to the Vercel project, set the env, redeploy. Server code reads the tenant with `getTenantSlug()`; client code gets it from `useConfig().slug`. The back office follows the same rule, so `admin.whatsup.jo` (mapped to `jo`) opens the Jordan books; a super admin still sees every tenant in Tenants.

A separate deployment per country (`NEXT_PUBLIC_TENANT=jo`, no host map) also works and is what a white-label operator on their own server will do.

## 3. Money (the only part that needs a bank)

* Payment methods on the tenant row (`payment_methods`): card, Whish (Lebanon only), OMT (Lebanon only), cash at the door. Jordan: card + cash; Cyprus: card (SEPA) + cash; Egypt: card + Fawry (adapter to write).
* Acquirer credentials on the `pay` and `payment-webhook` functions — the functions are per project, so a second country either shares the acquirer account (multi-currency) or gets its own function deployment with `PAYMENTS_PROVIDER` for that market.
* Fees: `buyer_fee_pct`, `buyer_fee_fixed`, `organiser_fee_pct`, `processing_pct` on the tenant row; the ledger, settlements and invoices are already per tenant.

## 4. WhatsApp

Each country has its own business number. Deploy `notify`, `wa-otp-hook` and `wa-inbound` once per number with `TENANT=<slug>` and that number's `WHATSAPP_PHONE_ID` / token (Supabase functions take one env set per function; name them `notify-jo` etc. and point `app_settings.notify_url` per tenant when the drain moves per tenant — today it drains all tenants from one function). Templates are language variants, so the same approved set serves every Arabic/English market.

## 5. Content

* Seed venues and listings through the organiser tools (poster-to-listing does most of it) or `supabase/seed/demo_v2.sql` adapted to the country.
* Photos: every listing needs a cover (the pace nudge reminds organisers).
* Founding venues: `docs/FOUNDING-VENUES.md` — the programme is a plan and a flag, so it works unchanged.

## 6. Switch on

Tenants → **Go live**. The country appears on the city sheet, the feed opens, and `/admin/reports` starts a separate P&L. Check: `GET /api/v1/events` with a key from that tenant returns only its listings; a test order posts a journal in the tenant's currency; the door scanner works on one of its events.

## What is deliberately shared

Auth (one account works in every country), the ledger schema, the public API, the back office, the design system and the edge functions. What is never shared: money, partners, settlements, promo codes, promoters, WhatsApp numbers.
