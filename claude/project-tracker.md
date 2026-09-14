# WhatsUp Ticketing — project tracker

**Revision 20** · 2026-09-14 · v0.5.0 — design brief v1.0 applied to the live app; monetisation model wired in as the upgrade ladder

## What changed in v0.5.0 (this revision)

* **Design system** (`docs/DESIGN.md`): the Design Brief v1.0 / prototype v0.6 look on every consumer and venue screen — white canvas, cedar greens, rationed red, facet band, system fonts (Google fonts removed), six tabs **Home · Search · Ask · Radio · Vibe · Wallet**, Profile behind the avatar, venue tools behind Profile → Venue (role-gated).
* **Listings v2** (`supabase/migrations/20260914100000_listings_v2.sql`, applied): `events.kind` (event / venue / stay / pass), `tiers.kind` (ticket / daypass / item / stay / pass) + `member_free` + `plan_months` + `note`, `events.deals`, `events.pinned`, `tickets.valid_until`, `orders.meta`, `venues.lat/lng`, `organisers.plan/plan_until`, `saved_deals`, `moments` (+ private storage bucket), `v_my_organisers`, `v_room_counts`; functions `upgrade_plan`, `buy_promotion`, `event_room`. Demo seed v2 (`supabase/seed/demo_v2.sql`, applied): beach club, dining venue with tables, guest house, Summer Pass with three plans, items, deals, a promoter, two venue stations.
* **Edge functions** redeployed: `create-order` (fees by kind — tickets 5% + $0.50, day passes/items 5%, stays 4%, tables/passes none; per-tier limits; a valid pass covers `member_free` offers; promoter vs referral code attribution with 10% off a friend's first order; `meta` for party/time/nights/gift; passes get `valid_until`; table-only bookings get a QR), `scan` (member cards scan every visit at any partner venue until expiry; kind in the result).
* **Buyer screens**: Home (band, city sheet, category rail, featured card = paid placement first, grid, pass promo, #WeAreLebanon), Search, Listing (hero, live meter, room, radio/story, OSM map card, offers with type-specific pickers, gift box, Notify-me waitlist, group booking, total, card / cash), Checkout, Wallet (member card, ticket cards with facet band + QR, coupons with Redeem), Ticket, Story card (9:16 + 1080×1920 PNG).
* **Experience layer**: `/api/ai` (Claude when `ANTHROPIC_API_KEY` is set, catalogue rules otherwise) → Ask (concierge with OPEN: action chips), Vibe (name, line, day → dinner → night, generated track), Radio (venue stations from `streams` + "Your vibe" station, ticket CTA), Rooms per listing (realtime chat, pinned live info), Your moment (upload to `moments`), Profile (referral code, settings, WhatsApp reminders, venue entry points, back office).
* **Upgrade ladder** (monetisation model → product): Plans page Free / Pro $49 / Venue with feature gating (promoters need Pro; station, passes, rules need Venue); Promote packages Boost $40 / Story bundle $120 / Takeover $300 per listing → `promotion_orders` (paid, ledger `rev:promotions`) + `featured_until`; promoters page with `?ref=` links, clicks, sales, commission; venue dashboard with KPIs, inventory sell-through by unit, payout waterfall by plan fee, station block; poster-to-listing with type selector and buyer-price / you-receive preview.
* **Verified locally** (production build, Playwright 390×844, EN + AR): home, listings (beach / dining / event / pass), search, ask, radio, vibe, story, room, wallet, checkout → sandbox card order → ticket (day pass $15 + $0.75 fee), venue dashboard, plans, promoters, new listing, door, promote, profile. `next build` green (41 routes).
* **Pending after deploy**: set `ANTHROPIC_API_KEY` on the `whatsup-ticketing-app` Vercel project; custom domains; payment partners (unchanged).

---

# Revision 19 (kept for provenance)

**Revision 19** · 2026-09-13 · session https://claude.ai/code/session_01JDd1CsAgTaqWteTAQPrFMW

> Revision 18 lived in the project chat and was not reachable from this session, nor was `whatsup-ticketing-repo.zip`.
> This revision was rebuilt from the live systems (Vercel deployments, the Supabase project, the build logs) and records
> exactly what was recovered, what was reconstructed, and what still needs a human.

## Status at a glance

| Item | State |
| --- | --- |
| Repository | `willytheboy/whatsup-ticketing` · `main` = **v0.4.0** (commit `18549b6`) · working branch `claude/kind-lovelace-k1v208` at the same commit |
| App build | `next build` green locally and on Vercel — 28 routes (consumer, organiser, `/admin`), middleware 26.6 kB |
| Vercel · ticketing | **whatsup-ticketing-app** (`prj_hMSiQzhwDnqaouNI28lNttxUk4M1`), git-linked, root `app`, production branch `main` — deployment `dpl_Fu4FLFggntrBRBX2cL7gK1L5CfZH` **READY** → https://whatsup-ticketing-app.vercel.app |
| Vercel · back office | **whatsup-backoffice-app** (`prj_6YWt2L2EgnaEtfR0f78CIun1q3bh`), git-linked, root `app`, production branch `main` — deployment `dpl_9bYaMkRYeJHNtubW4wPanaURxprM` **READY** → https://whatsup-backoffice-app.vercel.app (root redirects to `/admin`) |
| Supabase | project `xhwmgnhspyaqsgggvujo` (eu-central-1, Postgres 17) · 8 migrations applied · edge functions `create-order`, `scan`, `wa-otp-hook` ACTIVE · pg_cron `expire-holds` (every minute) and `weekly-payouts` (Mon 06:00 UTC) |
| Demo data | tenant `lb` (WhatsUp Lebanon), 1 organiser, 6 venues, 6 live events, 13 tiers, 2 VIP tables, promo `WHATSUP10`, 3 test users (`buyer@test.whatsup`, `door@test.whatsup`, wabunassar@gmail.com = super_admin) |

## Why the Vercel names carry an `-app` suffix

The two manually deployed projects from earlier today, `whatsup-ticketing` (`prj_IhThFJSqR8Ny1r2CFlZCSnrL6fn8`, 6 READY deployments)
and `whatsup-backoffice` (`prj_oVIlFrwPCwvHGgBAMQiiDHNNT2UO`, last deployment ERROR — "No Output Directory named public"), are **not
linked to Git**, and `create_git_project` cannot adopt or rename an existing project: the exact names return `409 Project already exists`.
The git-linked projects were therefore created as `whatsup-ticketing-app` and `whatsup-backoffice-app`.
To reclaim the short names: delete the two legacy projects in the Vercel dashboard, rename the `-app` projects, and set
`NEXT_PUBLIC_BACKOFFICE_URL` (or update the default in `app/src/lib/config.ts`). `src/middleware.ts` already matches any host starting
with `whatsup-backoffice`, so the redirect keeps working after a rename.

Note for future automation: the Vercel MCP `create_git_project` reuses the first project linked to a repository; the second project was
created by passing the repository URL with different casing (`WillyTheBoy/whatsup-ticketing`), which GitHub resolves identically.

### Legacy URL bridge (added after the first back-office report)

`https://whatsup-backoffice.vercel.app` (legacy project, not git-linked) now serves a one-file redirect deployment: every path 307s to
`https://whatsup-backoffice-app.vercel.app`, so the old ticketing app's "Back office" tab and any bookmark land on the real back office.
Signed-in verification on the live host (headless Chromium, temporary test admin, deleted afterwards): login form → overview with live
figures → orders, partners, ledger, settlements, team all render; the ticketing app shows the Back office tab for admins.
Back-office access still requires an account with `super_admin` or `country_admin` in `memberships` (wabunassar@gmail.com has it).

## What v0.4.0 contains

```
app/                Next.js 14.2.35 · TypeScript · @supabase/ssr · qrcode.react · next/font (Bricolage Grotesque, Instrument Sans, Tajawal)
  src/app/          / · /e/[slug] · /checkout · /tickets · /t/[code] · /login · /live · /live/[slug]
                    /org · /org/new · /org/e/[id] · /org/door · /org/finance
                    /admin (+ orders, ledger, partners, partners/[id], settlements, invoices, invoices/[id], reconcile, rules, reports, streams, team, audit)
  src/lib/          config (fees, formatters, TZ Asia/Beirut), i18n (EN/AR), lang hooks, roles, supabase clients, art
  src/components/   TopBar, Shell (tab bar), LoginForm (email/password + WhatsApp OTP), Logo
  src/middleware.ts back-office host → /admin
supabase/           migrations (verbatim), functions (verbatim), seed/demo.sql, README
docs/               ARCHITECTURE.md, DEPLOYMENT.md
```

### Provenance — recovered verbatim vs reconstructed

| Piece | Source | Fidelity |
| --- | --- | --- |
| 8 migrations | `supabase_migrations.schema_migrations` in the live project | verbatim |
| 3 edge functions | Supabase Management API (function sources) | verbatim |
| Seed data | rows read from the live tables | exact ids/values |
| Client components (checkout, tickets, ticket, login, live, stream, org hub/new/manage/door/finance), i18n dictionary, config, roles hook, tab shell, CSS | de-minified from the production bundles of `whatsup-ticketing.vercel.app` | behaviour-faithful rewrite in TypeScript |
| Server components (`/`, `/e/[slug]`, root layout) | server-rendered HTML + route map from the build log | reconstructed; identical markup and copy |
| `/admin/*` back office (15 routes) | the legacy backoffice build never succeeded and its source was not retrievable; rebuilt from the route list in its build log, the `.bo` styles that shipped in the consumer bundle, and the `v_admin_*` views / `admin_*` RPCs in the migrations | new implementation |

### Intentional differences from the last manual deployment

* All dates/times render in `Asia/Beirut` (the manual deployment rendered UTC, showing a 19:00 event as 16:00).
* One codebase serves both Vercel projects (the layout already special-cased `/admin`); the separate `whatsup-backoffice@0.1.0` package is retired.
* `BACKOFFICE_URL` default now points at `whatsup-backoffice-app.vercel.app`.

## Verification done this session

* `tsc --noEmit` clean; `next build` clean; bundle sizes within ±0.2 kB of the original deployment per route.
* Local `next start`: Discover lists the 6 live events from Supabase, event page renders tiers/tables, `lang=ar` cookie flips `<html lang="ar" dir="rtl">`, unknown event → 404, back-office host and `NEXT_PUBLIC_APP_ROLE=backoffice` both 307 → `/admin`.
* Live: https://whatsup-ticketing-app.vercel.app/ (200, events rendered), https://whatsup-backoffice-app.vercel.app/ (307 → `/admin`).

## Open items

1. **Reclaim short Vercel names** (see above) — needs the dashboard; then set `NEXT_PUBLIC_BACKOFFICE_URL`.
2. **Retire legacy projects** `whatsup-ticketing` / `whatsup-backoffice` once traffic moves (they are not auto-deployed).
3. **WhatsApp**: enable phone sign-in in Supabase Auth and wire the *Send SMS* hook to `wa-otp-hook` with `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID`; ticket delivery messages are still only queued in `message_log` (no sender worker yet).
4. **Payments**: `create-order` is in sandbox (card/Whish settle instantly). Live mode needs a provider redirect + webhook that calls `settle_reservation` / marks orders paid, then `PAYMENTS_MODE=live`.
5. **Back office QA**: the admin pages are new — walk each flow with real data (order refund, adjustment, settlement generation → mark paid, provider batch import, rule application) and tighten copy.
6. **Hardening**: the anon key default lives in `config.ts` (public by design, RLS-protected); move to Vercel env vars when convenient. Add ESLint config (builds currently skip lint) and a smoke test.
7. **Docs**: rev 18 and the original project docs are still only in the project chat — re-upload them to `docs/` so the repo is the source of truth.

## Change log

* **rev 19 (2026-09-13)** — repo rebuilt and pushed as v0.4.0; git-linked Vercel projects created and READY; tracker moved into the repo; legacy back-office URL bridged to the new host after a "back office not loading" report.
* rev 18 and earlier — in the project chat (not recoverable here).
