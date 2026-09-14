# What's Up Ticketing

The community of @whatsuplebanon turned into a place to discover and book everything to do in a city — events, music, theatre, sport, dining, beach clubs, stays, deals and passes — with a radio, a concierge, rooms and a vibe creator on top. Tickets on WhatsApp. One Next.js 14 codebase serves three surfaces (design system: `docs/DESIGN.md`, from the Design Brief v1.0 of 14 Sep 2026):

| Surface | Routes | Deployed as |
| --- | --- | --- |
| Consumer app — Home · Search · Ask · Radio · Vibe · Wallet, listing with seven offer types, checkout, tickets and member cards, Story cards, rooms, fan moments, profile | `/`, `/search`, `/e/[slug]`, `/checkout`, `/wallet`, `/t/[code]`, `/story/[slug]`, `/ask`, `/vibe`, `/radio`, `/live/[slug]`, `/room/[id]`, `/moment`, `/profile`, `/login` | Vercel project **whatsup-ticketing-app** (https://whatsup-ticketing-app.vercel.app) |
| Venue tools (dashboard, poster-to-listing, manage, Promote packages, plans Free/Pro/Venue, promoters, door scanner, partner finance) | `/org`, `/org/new`, `/org/e/[id]`, `/org/promote/[id]`, `/org/plan`, `/org/promoters`, `/org/door`, `/org/finance` | same deployment |
| Back office (orders, double-entry ledger, partners, settlements, invoices, provider reconciliation, revenue-share rules, reports, streams, team, audit) | `/admin/*` | Vercel project **whatsup-backoffice-app** (https://whatsup-backoffice-app.vercel.app, root URL redirects to `/admin`) |

Both Vercel projects build the `app/` directory. The back-office deployment is detected by hostname (`whatsup-backoffice*`, so the legacy `whatsup-backoffice` name works too) or `NEXT_PUBLIC_APP_ROLE=backoffice`.

## Layout

```
app/        Next.js 14 (App Router, TypeScript). src/app = routes, src/lib = config/i18n/supabase, src/components = shared UI
supabase/   migrations (9), edge functions (create-order, scan, wa-otp-hook), demo seeds (demo.sql, demo_v2.sql)
claude/     project tracker (working log for the AI-assisted build)
docs/       architecture and deployment notes
```

## Run locally

```bash
cd app
npm install
cp .env.example .env.local   # optional — defaults point at the shared Supabase project
npm run dev                  # http://localhost:3000
npm run build                # production build (what Vercel runs)
```

## Data and money model (short version)

* Multi-tenant Postgres on Supabase (`tenants` → organisers, venues, events, tiers, orders, tickets…). Row-level security everywhere; the browser talks to Supabase directly with the public anon key.
* One Listing (`events` row, `kind` event | venue | stay | pass) sells Offers: tiers of a `kind` (ticket, daypass, item, stay, pass), VIP tables and deals. Buyer fees by type, shown all-in: tickets **5% + $0.50**, day passes and items **5%**, stays **4%**, tables / passes / deals **none**. Organiser receives **face − organiser fee (3% Free · 2.5% Pro · 2% Venue) − ~2.5% card processing + table deposits**; free things carry no fees. A valid pass covers `member_free` offers.
* The upgrade ladder (monetisation model): organiser plans **Free / Pro $49 / Venue** (`upgrade_plan()` posts a service charge and unlocks tools), **Promote packages** Boost $40 · Story bundle $120 · Takeover $300 (`buy_promotion()` → `promotion_orders` → `rev:promotions`, featured placement on Home), promoter `?ref=` links with commissions, passes and memberships, stream passes.
* Checkout runs in the `create-order` edge function: holds inventory, prices the order from the tenant's fee snapshot, issues HMAC-signed ticket tokens (`WU1.<id>.<sig>`), and either settles instantly (card, Whish — sandbox) or creates a reservation (OMT, cash at door) that expires before doors.
* Every paid order posts a balanced journal to an append-only ledger (`journals`/`journal_lines`). Revenue-share rules, promoter commissions, referral credits, refunds, settlements and provider batches all post journals too; nothing is ever edited, only reversed.
* Weekly settlements per partner: positive balances are paid out, negative ones (organisers holding door cash) are invoiced automatically.
* Door check-in calls the `scan` edge function, which verifies the token signature and flips the ticket to `scanned` exactly once.

See `docs/ARCHITECTURE.md` for the full picture, `docs/DESIGN.md` for the design system, `docs/UPGRADE-STRATEGY.md` for the monetisation ladder, and `supabase/README.md` for the database layer.
