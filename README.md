# WhatsUp Ticketing

Event tickets for Lebanon, delivered on WhatsApp. One Next.js 14 codebase serves three surfaces:

| Surface | Routes | Deployed as |
| --- | --- | --- |
| Consumer app (Discover, event page, checkout, tickets, Live streams + chat, WhatsApp/email sign-in) | `/`, `/e/[slug]`, `/checkout`, `/tickets`, `/t/[code]`, `/live`, `/live/[slug]`, `/login` | Vercel project **whatsup-ticketing-app** (https://whatsup-ticketing-app.vercel.app) |
| Organiser tools (hub, new/manage event, door scanner, partner finance) | `/org`, `/org/new`, `/org/e/[id]`, `/org/door`, `/org/finance` | same deployment |
| Back office (orders, double-entry ledger, partners, settlements, invoices, provider reconciliation, revenue-share rules, reports, streams, team, audit) | `/admin/*` | Vercel project **whatsup-backoffice-app** (https://whatsup-backoffice-app.vercel.app, root URL redirects to `/admin`) |

Both Vercel projects build the `app/` directory. The back-office deployment is detected by hostname (`whatsup-backoffice*`, so the legacy `whatsup-backoffice` name works too) or `NEXT_PUBLIC_APP_ROLE=backoffice`.

## Layout

```
app/        Next.js 14 (App Router, TypeScript). src/app = routes, src/lib = config/i18n/supabase, src/components = shared UI
supabase/   migrations (8), edge functions (create-order, scan, wa-otp-hook), demo seed
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
* Buyer pays **face + 5% + $0.50** per paid ticket (all-in pricing). Organiser receives **face − 3% organiser fee − ~2.5% card processing + table deposits**; free tiers carry no fees.
* Checkout runs in the `create-order` edge function: holds inventory, prices the order from the tenant's fee snapshot, issues HMAC-signed ticket tokens (`WU1.<id>.<sig>`), and either settles instantly (card, Whish — sandbox) or creates a reservation (OMT, cash at door) that expires before doors.
* Every paid order posts a balanced journal to an append-only ledger (`journals`/`journal_lines`). Revenue-share rules, promoter commissions, referral credits, refunds, settlements and provider batches all post journals too; nothing is ever edited, only reversed.
* Weekly settlements per partner: positive balances are paid out, negative ones (organisers holding door cash) are invoiced automatically.
* Door check-in calls the `scan` edge function, which verifies the token signature and flips the ticket to `scanned` exactly once.

See `docs/ARCHITECTURE.md` for the full picture and `supabase/README.md` for the database layer.
