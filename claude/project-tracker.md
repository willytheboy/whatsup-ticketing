# WhatsUp Ticketing — Project Tracker

Single consolidated record across every chat in this project. Read this first; update it as work progresses.

_Last updated: 14 Sep 2026 — rev 21 (v0.6.0: everything in the gap analysis implemented — schema v3, six edge functions, venue tools, offline door, buyer flows, experience layer, upgrade ladder v2, back-office queues, public API, intelligence, localisation, assets; integrations are env-driven and run in sandbox until credentials arrive)_

---

## 1. Where things stand (one-paragraph summary)

WhatsUp Ticketing is an event-ticketing venture that WhatsUp Lebanon (Kareem Chaarani) is starting, with Willy as **developer and technical partner**. The Lebanon launch is the template; WhatsUp [Country] editions follow later. Approved: brief v2.0, partnership & pricing strategy v1.0, functional spec v1.0, App Design Brief v1.0 (14 Sep). **Decision: funding Option A** — Willy builds the core with Claude; RSCB is offered design/front-end (email variant 2, to send before Thu 17 Sep; quote expires ~20 Sep). **Built:** prototype v0.6 → **live app v0.6.0 at https://whatsup-ticketing-app.vercel.app** in the brief's design (white canvas, cedar greens, facet band, six tabs Home · Search · Ask · Radio · Vibe · Wallet; listings with seven offer types; wallet with member cards; Story cards; concierge, vibe creator, radio, rooms, fan moments; venue tools with plans Free / Pro / Venue, Promote packages, promoters, poster-to-listing), Supabase backend (schema v2, fee engine by offer type, holds, edge functions, sweeper, ledger, settlements, reconciliation), **back office at https://whatsup-backoffice-app.vercel.app** (13 screens). Repo `willytheboy/whatsup-ticketing` on `main` = v0.6.0, both Vercel projects git-linked and deploying on push. Money model in §10; the upgrade ladder in §11 and `claude/upgrade-strategy.md`; what v0.6.0 added in §12. **What is left is credentials, not code:** card acquirer / Whish, WhatsApp Business (Meta Cloud API + template approval), Resend, Anthropic key, a streaming URL per station (§12 table).

---

## 2. Parties & roles

| Party | Role |
|---|---|
| Willy (Walid Abu Nassar) | Technical partner: product & architecture, platform IP (payments, QR, scanning, WhatsApp delivery proven in BlendApp / Loft OS), vendor management, ongoing dev & ops |
| Kareem Chaarani — WhatsUp Lebanon, Beirut (Monot), +961 3 533 119 | Brand, audience across five platforms, content team, organiser/venue relationships, sales |
| RS Creative Boutique, Paris — info@rscreativeboutique.com, +33 7 55 55 68 68 | Vendor; quotation RSCB-57813 dated 21 Aug 2026, valid 30 days |

Vendor correspondence goes out jointly, signed by Willy (Technical Partner) and Kareem (WhatsUp Lebanon).

**Boundary (13 Sep 2026):** WhatsUp Ticketing does not involve Sporting Club or any of its venues. Sporting Club is / will become a client and subscriber of the platform once built — an early reference organiser, not an owner. Keep the venture, its IP and its finances separate from Sporting Club. (Demo data in the live app uses fictional Lebanese venues for that reason.)

## 3. WhatsUp Lebanon — the backbone brand

The service launches through WhatsUp Lebanon's audience; its owned reach is the distribution strategy ("the audience becomes the box office").

**Instagram baseline**

| Date | Followers | Posts | Following | Notes |
|---|---|---|---|---|
| 13 Sep 2026 | 836K | 53.5K | 7,797 | Baseline at project start (Willy's screenshot) |

Brand identity: display name "😎 What's Up Lebanon 😎"; white circle logo with low-poly green landscape and red cedar; wordmark light "WHAT'S UP" over heavy "Lebanon"; tagline "Where every image is a story"; sunglasses persona; fan-submitted photo culture. Handles: `whatsuplebanon` on Instagram, TikTok, X, Threads; Facebook `whatsuplebanonofficial`. Beware look-alikes `whatsuplebanon.official`, `watsapp_lebanon`. Instagram blocks automated reads — new data points come from screenshots.

## 4. Vision, benchmarks, monetisation (brief v2.0) and design (App Design Brief v1.0)

- Media-led discovery + ticketing; compete on distribution, not feature count. Long-term: one multi-tenant platform, each country a tenant.
- Benchmarks — global: Ticketmaster/Live Nation, Eventbrite, DICE, Resident Advisor, Fever, Posh; MENA: Platinumlist; Lebanon: Tick'it (~60% of music listings, table booking, 3,000+ cash points of sale), ihjoz (OMT/LibanPost offline payments).
- Launch fees: buyer service fee 5% + $0.50/ticket shown all-in; organiser fee 3% of face (waived on free events); processing at cost; target blended take rate 8–10% of gross.
- Later revenue: organiser plans (Free / Pro $49/mo / Venue); media (featured placement, IG/TikTok bundles, sponsored categories, WhatsApp broadcasts); ancillary (table/VIP, transfer/resale, refund protection, add-ons, venue insights). **→ shipped as the upgrade ladder in v0.5.0, see §11.**
- Design direction (App Design Brief v1.0, 14 Sep, `WhatsUp_App_Design_Brief_v1.md`): the feed is the box office; white canvas, fan colour; red rationed; all-in always; everything Story-ready; cash first class; one object, seven offers; Arabic-native; thumb first; reveal, don't gate. Where the prototype and the brief differ, the brief wins. **→ applied to the live app in v0.5.0 (`docs/DESIGN.md` in the repo).**

## 5. Scope

**5a. RSCB-57813** ($11,265; A $10,000 site + admin, B $1,265 hosting/support; 8 weeks; 50/50 payments; 3 design revisions; $80/hr extras): public site (listings, event pages, accounts with email or WhatsApp OTP, checkout, payment gateway, QR e-tickets by email, My Tickets, search, emails, static pages) and admin (dashboard, event CRUD, tiers, orders/refunds, customers, promotions, QR check-in, reports, roles).

**5b. MVP additions beyond the quote:** fee engine · USD/LBP · Lebanese card + OMT / Whish / cash-on-door · WhatsApp ticket delivery · organiser self-serve portal · payout/settlement module · promoter links · featured-placement management · offline-capable door scanner · Story/TikTok share cards · EN + AR (RTL).

**5c. Super-app layer:** AI, music listener / live venue stations, chatbot, chat rooms, "vibe creator" — two tracks (A ticketing core, B AI/music/chat). **Track B first cut shipped in v0.5.0** (concierge, vibe, radio, rooms; Claude behind `/api/ai` once `ANTHROPIC_API_KEY` is set on Vercel).

**5d. Later phases:** transfer/resale, seat maps, refund protection, buyer app, dynamic pricing, squad / split-pay; Phase 3 second country. (Table booking and waitlists shipped in v0.5.0.)

**5e. Multi-country architecture:** multi-tenant from day one; pluggable payment adapters; central super-admin + scoped country admins; full localisation; API-first; code/infra/data owned by WhatsUp.

**Judgement on the quote:** realistic for a marketplace-lite, not this platform; expect ~1.5–2× and 12–14 weeks; renegotiate scope before ~20 Sep.

## 6. Partnership & pricing strategy (v1.0) — unchanged

Two layers: PlatformCo (Willy 75–80% / WUL 20–25%) licenses to country OpCos; Lebanon OpCo 50/50 (Willy floor 40%), exclusive brand licence, platform fee 25% of net platform revenue at launch (later 1.5–2% GMV or $0.30/ticket min; $500/month min from month 4). Protections: vesting, IP assignment, non-withdrawable brand licence, split decision rights, buy-out formula; consider PlatformCo outside Lebanon. Negotiation plan: contributions table → two layers → asks → fee anchor → funding option → 30-day term sheet. Full detail in memory (`partnership-strategy`).

## 7. Deliverables

| Deliverable | Status |
|---|---|
| Brief v1.0 → v2.0; Partnership & pricing strategy v1.0; claude/kareem-meeting-brief.md; claude/rscb-email-drafts.md (variants 1 & 2) | Delivered / approved |
| Prototype v0.2 → v0.6 (live artifact claude.ai/code/artifact/a276cbdb-30ff-4372-b550-5f94aff67b54) · `whatsup-prototype-v0.6.html` · `WhatsUp_App_Design_Brief_v1.md` | Published 13–14 Sep; **applied to the app 14 Sep** |
| claude/whatsup-functional-spec.md v1.0 (pricing basis for RSCB) | Delivered; §10 extends it |
| db/001_core_schema.sql · db/002_sweeper_payouts.sql · db/003_ledger_partners.sql · db/004_backoffice.sql | Applied |
| **Migration `listings_v2`** (repo `supabase/migrations/20260914100000_listings_v2.sql`): `events.kind` / `cover_url` / `deals` / `pinned`, `tiers.kind` / `member_free` / `plan_months` / `note`, `tickets.valid_until`, `orders.meta`, `venues.lat/lng`, `organisers.plan/plan_until`, `saved_deals`, `moments` + storage bucket, `v_my_organisers`, `v_room_counts`, functions `upgrade_plan` / `buy_promotion` / `event_room` | Applied 14 Sep |
| **Demo seed v2** (`supabase/seed/demo_v2.sql`): beach club, dining venue with tables, guest house, Summer Pass (3 plans), items, deals, promoter NOUR-WU, two venue stations | Applied 14 Sep |
| functions/ create-order (fees by kind, pass coverage, attribution, meta), scan (member cards repeat), wa-otp-hook, lib.ts | Deployed (create-order v2, scan v2 on 14 Sep) |
| **App v0.5.0** — Next.js source, one codebase for public app + back office; `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` | **Live 14 Sep** on whatsup-ticketing-app.vercel.app and whatsup-backoffice-app.vercel.app |
| GitHub `willytheboy/whatsup-ticketing` `main` @ 4ac2101 (v0.5.0) | Pushed 14 Sep (from Willy's workstation via a git bundle; both Vercel projects deploy on push) |
| claude/upgrade-strategy.md — monetisation model → product ladder | Written 14 Sep |
| claude/project-tracker.md (this doc) | Living |

## 8. Decision log (newest first)

| Date | Decision / event |
|---|---|
| 14 Sep 2026 | **v0.6.0 built and verified** — the whole `claude/gap-analysis-v0.5.md` implemented in one pass (§12): schema v3 (5 migrations, all applied), edge functions `create-order` v3, `scan` v3, new `wallet`, `pay`, `payment-webhook`, `notify` (all deployed and exercised with curl: order with refund protection $57.50, sell-back → resale pool → second buyer fulfilled → seller credited $25, rotating-QR scan valid / duplicate / stale, offline sync, credit payment, transfer → claim), production build green, Playwright EN 390 / AR 375 through 33 screens with zero page or console errors, axe pass (viewport zoom re-enabled, `--ink3` darkened to pass 4.5:1, red badge uses red-dark, login inputs labelled). Integrations are env-driven with sandbox fallback — see §12 for the exact secrets |
| 14 Sep 2026 | **v0.5.0 live** (ticketing dpl_HnqueJfihugckJjp9j5ZQQHJtZAg, back office dpl_HxeFqX5VrZ2E3hzXREBygq1rDWLs, both READY from commit 4ac2101). Design Brief v1.0 applied end to end; monetisation model shipped as the upgrade ladder (§11). Verified before push with a production build and Playwright at 390×844 in EN and AR: home, listings (beach / dining / event / pass), search, ask, radio, vibe, story, room, wallet, checkout → sandbox card order → ticket (day pass $15 + $0.75 fee, kind-based), venue dashboard, plans, promoters, new listing, door, promote, profile. Live smoke test: all routes 200, `/live` → `/radio`, `/tickets` → `/wallet`, `/api/ai` answers from the catalogue (`ai:false` until the key is set) |
| 14 Sep 2026 | **Push path that works without the repo attached to the session:** create a git bundle in the cloud workspace → `device_commit_files` into a folder Willy approves on mega-workstation (`C:\Users\user\whatsup-ticketing`, a fresh clone) → PowerShell `git fetch bundle main && git merge --ff-only && git push` with his credential manager. Direct file deploys to Vercel are not viable for the full tree (payload size); the earlier "attach the repo when starting the session" route also works |
| 14 Sep 2026 | **Navigation per the brief** replaces the 13 Sep role-tab scheme: six tabs for everyone (Home · Search · Ask · Radio · Vibe · Wallet), Profile behind the avatar, venue tools behind Profile → Venue shown only to organiser / door / admin roles, back office only to admins. Willy's rule "reveal only what the role needs" is kept: buyers never see venue tools |
| 14 Sep 2026 | **Fees by offer type** (edge function + UI): tickets 5% + $0.50, day passes and items 5%, stays 4%, tables / passes / deals none; organiser fee by plan (3% Free, 2.5% Pro, 2% Venue); a valid pass covers `member_free` offers; a friend's referral code gives 10% off the first order; promoter codes attribute without a discount unless a promo code is added |
| 14 Sep 2026 | **System font stack, no dark mode** (brief §3.3, §3.2) — Google fonts removed from the app |
| 14 Sep 2026 | Back office launched on whatsup-backoffice-app.vercel.app (legacy short-name project redirects there); tracker rev 19 rebuilt from live systems in a session that had the repo attached and pushed v0.4.0 |
| 13 Sep 2026 | Deploy lessons: base64 bundles cost ~3× the tokens of plain source, and a build that downloads its source at build time is an RCE surface (correctly refused) — full-tree file deploys or git are the only sound paths |
| 13 Sep 2026 | Role-aware navigation directive (Willy): information follows access — superseded in form by the brief's six tabs on 14 Sep, kept in substance |
| 13 Sep 2026 | Public app v0.4.0 deployed: Live section, organiser Finance, role-aware tabs, one-codebase/two-projects build mode |
| 13 Sep 2026 | Back office built (/admin, 13 screens) and ledger tests passed (sale journals balance to the cent; cash-at-door receivable; promoter commission; venue rule; promotion → rev:promotions; stream pass 70% to venue; refund reversals; settlement paid → bank; provider batch discrepancies; audit rows) |
| 13 Sep 2026 | New platform requirements recorded (Willy): complete booking platform with partners and venues; profit/commission from tickets, promotions & marketing, added-value services (chatrooms, live music); venues stream their own music; transparent accounting → implemented as §10 |
| 13 Sep 2026 | App v0.2 → v0.3.0; web app deployed; Supabase project created, core schema v1; **Funding Option A** decided; prototype v0.1 → v0.6; brief v2.0; two-track model; Instagram baseline; venture independent of Sporting Club; Willy = developer & partner |
| 21 Aug 2026 | Quotation RSCB-57813 received |

## 8b. Test access (dev only — rotate/remove before launch)

Public app: **https://whatsup-ticketing-app.vercel.app** · Back office: **https://whatsup-backoffice-app.vercel.app** (same login; opens on /admin; the old whatsup-backoffice.vercel.app redirects here). Sign-in: tap **Email** first.

| Account | Password | Roles | Use it for |
|---|---|---|---|
| wabunassar@gmail.com | WhatsUp2026! | organiser, door, super_admin | Everything incl. venue tools and back office |
| buyer@test.whatsup | Test1234! | buyer | Pure buyer flow (six tabs, no venue tools) |
| door@test.whatsup | Test1234! | door, organiser | Door scanner and venue dashboard |

Promo code: WHATSUP10. Promoter link: `/?ref=NOUR-WU`. Sandbox: card/Whish settle instantly; OMT/cash reserve until settled at the door (Orders → Mark paid). Demo listings: Sunset Sessions (event with deal), Batroun Rocks Beach House (day pass covered by the pass, cabana, items, deal), Marina Fish House (tables), Beit Douma (stay), Summer Pass 2027 (pass with three plans).

## 9. Open decisions & actions (priority order)

**Deploy & repo**
- [x] Repo pushed and git-linked; v0.5.0 live on both Vercel projects (14 Sep)
- [ ] **Set `ANTHROPIC_API_KEY`** (optional `ANTHROPIC_MODEL`) on the `whatsup-ticketing-app` Vercel project → concierge, vibe creator and poster-to-listing switch from catalogue rules to Claude
- [ ] Custom domains (tickets.whatsuplebanon.com, office.whatsuplebanon.com); delete the two legacy non-git Vercel projects and rename the `-app` ones to reclaim the short names
- [ ] Note for future sessions: a Cowork session can only push to a repository attached when it starts; otherwise use the bundle → workstation → push path (decision log 14 Sep)

**Credentials to obtain (code is ready; each switches a sandbox to live — §12 table)**
- [ ] Card acquirer: Areeba (MPGS hosted checkout) merchant id + API password → `PAYMENTS_PROVIDER=areeba`, `PAYMENTS_MODE=live`; or Stripe as a stopgap
- [ ] Whish Money collect API (channel, secret, website URL)
- [ ] WhatsApp Business: Meta Cloud API token + phone id, approve the 13 templates in `docs/WHATSAPP-TEMPLATES.md`, enable phone sign-in + the Send-SMS hook
- [ ] Resend API key (email copies); `ANTHROPIC_API_KEY` on Vercel (concierge, copilot, translation, poster-to-listing switch to Claude)
- [ ] `NOTIFY_SECRET` on the `notify` function = `app_settings.notify_secret` (already inserted: ccbd150e6bfde2aeda6460f61fb9b8e1fa9c400384e657f0); `TICKET_SECRET` dedicated value; `APP_URL`
- [ ] Streaming: an HLS / audio URL per station (Mux, Cloudflare Stream or Icecast) pasted in the dashboard's "Go live" box; RTMP-key issuance is a later integration
- [ ] Native wallet passes (Apple / Google) need certificates — not built; the in-app wallet with rotating QR and "save image / add to calendar" covers launch

**Build plan — later**
- [ ] Real provider imports: acquirer/Whish/OMT settlement report formats → reconciliation importer presets; bank feed later
- [ ] WhatsApp broadcast to past buyers (Pro) once the Business account is approved — the buyer list and the queue already exist
- [ ] Partner onboarding flow (KYC-lite: legal name, tax ID, payout details) and monthly statement emails (drafts exist in Settlements)
- [ ] Remove dev test accounts; rotate Willy's test password before launch; run `scripts/load/k6-onsale.js` against a staging tenant before the first big on-sale

**Before Thu 17 Sep / ~20 Sep**
- [ ] Send joint RSCB email variant 2 with the functional spec (the live v0.5.0 now shows RSCB exactly what "design/front-end" means); meeting with Kareem (negotiation plan §6)

**Product decisions pending:** approve fees (§4, now implemented as defaults); pick payment partners; domain convention; organiser relationship ownership; lawyer for PlatformCo/brand licence.

**Housekeeping:** next Instagram data point monthly and per campaign.

## 10. Money model & partner requirements (v0.4.0 — implemented, unchanged in v0.5.0)

**Revenue streams shared with partners:** (1) **tickets** — buyer fee (by offer type since v0.5.0) and organiser fee (by plan since v0.5.0) are platform revenue; (2) **promotions & marketing** — package price is platform revenue; (3) **services** — stream passes, subscriptions, chat premium, venue streaming plans, organiser plans (`organiser_plan` since v0.5.0). `revenue_share_rules` give a beneficiary partner a % of a basis (platform revenue / face / gross) per stream, scoped to tenant, organiser, venue or event, with validity dates and priority; applied automatically when the order/promotion/charge is paid and posted as its own journal the partner can see. Service charges carry a provider share (default 70% to the venue). Promoter commissions come out of the organiser's share.

**Ledger:** append-only double-entry `journals` + `journal_lines`, balanced by a deferred trigger, immutable (corrections are reversals). Accounts per tenant: `clearing:<card|whish|omt>`, `bank`, `buyer_credit`, `rev:tickets|promotions|services`, `processing_recovery`, `processing_expense`, `revenue_share`, `referral_marketing`, and per partner `payable:<id>` / `receivable:<id>` (cash collected at the door). Partner net balance = payable − receivable (+ we owe them, − they owe us).

**Collection & settlement:** card/Whish/OMT → provider clearing → bank when the provider pays out; cash at door → organiser receivable. Weekly (`generate_settlements`, Mon 06:00) or on demand: positive balances become settlements (partner can request early), negative balances become an invoice from WhatsUp (`LB-INV-2026-00001`…). Marking paid/received posts the bank movement and closes the invoice.

**Reconciliation:** import the provider's payout report (CSV/JSON: ref, gross, fee, net, date, order_id) → matched / discrepancy / unmatched per transaction, missing orders counted, batch posts bank ← clearing with the real fee as expense; unreconciled orders and non-zero clearing balances surface on the Overview.

**Transparency & audit:** partners see their own statement (opening, lines by stream, closing), settlements and invoices in the app (/org/finance) and can be given portal access by email; every financial object change is written to `audit_log` with actor and before/after; every number on a statement or invoice links to a journal.

**Streams & rooms:** `streams` per venue/event (audio/video; HLS, Icecast, MP3, YouTube; private ingest URL + key; public / ticket-holders / paid pass), status offline/live/ended, auto-created chat room with realtime messages; `buy_stream_pass()` creates a paid service charge (sandbox) and a 24-hour pass. Since v0.5.0 every listing also gets a public room on first open (`event_room()`), shown as "Room" on the listing with the venue's pinned live-info line.

## 11. v0.5.0 — design system and upgrade ladder (14 Sep 2026)

**Design (brief v1.0 → code):** tokens g1–g4 / red / red-dark / ink / line / sand / amber; radii 14 / 10 / 999 / 18; facet band SVG at 120 / 80 / 72 / 56 px; system fonts; components as in brief §6 (card, photo card + badge, chips, buttons red/green/line, stepper, slot chips, plan cards, offer rows, meter, map card, gift box, ticket card, member card, coupon, chat bubbles, action chips, compose bar, station tile, player, KPI tile, sell-through, result banner, bottom sheet, toast, tab bar, form field, drop zone). Screens: Home, Search, Listing (+ pickers by type), Checkout, Wallet, Ticket, Story, Radio, Ask, Room, Vibe, Your moment, Profile, Venue dashboard, New listing (poster-to-listing), Manage, Promote, Plans, Promoters, Door, Finance. Full mapping in the repo's `docs/DESIGN.md`.

**Upgrade ladder (monetisation model → product):** buyers — all-in fees by offer type, passes and member cards, deals, stream passes, referral 10% / $5; organisers — Free (3%) → Pro $49/mo (2.5%, promoters, insights, broadcast, $20 placement credit) → Venue negotiated (2%, own station, passes/memberships/day passes/items, rev-share rules, statements); media — Promote packages Boost $40 / Story bundle $120 / Takeover $300 per listing → `promotion_orders` → featured on Home. Every rung posts to the ledger. Full text in `claude/upgrade-strategy.md`.

## 12. v0.6.0 — the gap analysis, implemented (14 Sep 2026)

**Schema v3** (`20260914125900` … `20260914143000`, all applied): ticket states `resale` / `sold_back`, `recipient`, `claim_code`, `rot_key`; `saved_listings`, `squads` (+ `join_squad`, `squad_pay_share`); `covers` storage bucket; stream subscriptions and tips (`buy_stream_subscription`, `tip_stream`), organiser stream control (`org_set_stream_status/url`); `buy_promotion` with the Pro $20 monthly credit; promoter tiers (`promoter_tier_refresh`, nightly); `org_insights`, `org_buyers`; `api_keys` (+ `create_api_key`, `api_events`, `api_orders`), `webhook_endpoints` / `webhook_deliveries` with `dispatch_webhook` over pg_net (HMAC-signed) on `order.paid` / `ticket.scanned`; `client_errors`; `my_export`, `delete_my_account`; `create_tenant`; `app_settings` + `queue_reminders` (24h / 2h), `queue_weekly_digest`, `drain_messages` on pg_cron; `notify_waitlist`; `door_collect`, `org_refund_order`, `add_credit`; views `v_admin_promotions`, `v_admin_moments`, `v_scan_alerts`, `v_org_refunds`; policies for organiser self-edit, venues, waitlist reads, own-message delete; coming-soon tenants (UAE, Egypt) as rows.

**Edge functions:** `create-order` v3 (resale-pool fulfilment when a tier is sold out, refund-protection add-on 8% min $1, fan credit first, table packages, 30-day referral window, squads, live-mode hand-off), shared `fulfilOrder` (idempotent issuance, `WU1` static + per-ticket `rot_key` for `WU2` rotating tokens, referral $5 credit, sold-back credit + messages), `pay` (sandbox settle or hosted checkout: Stripe / Areeba MPGS / Whish adapters in `providers.ts`), `payment-webhook` (verifies with the provider before issuing; no JWT), `scan` v3 (WU1/WU2 ±2 min, day pass once per day, table deposit on arrival, duplicate attempt count, `collect` cash at door, `manifest`, `lookup`, offline `sync`), `wallet` (`keys`, `transfer` → new QR + claim link, `claim`, `sell_back` / `unlist`, `refund_request` per policy or add-on), `notify` (drains `message_log`; Meta Cloud API templates EN/AR or text mode, Resend email copies; sandbox rendering without credentials).

**App:** listing editor with tabs (cover upload, EN/AR basics, pinned line, refund policy, photo credit, venue with Arabic address and pin, offers of every kind with sale windows / member-free / pass months / note / "tell the waitlist", tables with bottle packages, deals, refund queue); new listing with several offers and a cover; promo codes; dashboard with 7-day chart, nudges, forecasts, top listings, promoter conversion, Go live / End on stations, venue WhatsApp number, copilot; insights + CSV export (Pro); refunds; developers (API keys, webhooks, deliveries); promoters with tiers, leaderboard, share kit, commission picker. Door: PWA (manifest, icons, splash, service worker), IndexedDB manifest + offline verification, scan queue + sync, jsQR fallback for iOS Safari, counters, duplicate alerts, name/code lookup, mark paid at the door, simulate. Buyers: live rotating QR on ticket and member cards, actions sheet (save image, calendar .ics, transfer, sell back / unlist, refund, squad, ask the venue), upcoming / past wallet, fan credit, claim page, squad pages, calendar sheet for stays, table packages, group booking to the venue's WhatsApp, refund protection and credit at checkout, hosted-checkout pay / done pages. Experience: concierge with cart action (→ checkout), mic, WhatsApp hand-off; room translation on tap, delete for authors / organisers / admins, assistant welcome with "Grab a seat"; For-you row and saved listings with a heart; settings for USD/LBP, WhatsApp tickets / reminders, email copies, data export, account deletion. Back office: promotions queue, moments review, tenants, errors, organiser plan setter + verified, flags, scan alerts, ask-the-ledger, statement drafts. Platform: `/api/v1/events`, `/api/v1/events/[slug]`, `/api/v1/orders`, `/api/me/export`, error boundary → `client_errors`, `scripts/load/k6-onsale.js`, `docs/API.md`, `docs/WHATSAPP-TEMPLATES.md`, `docs/FOUNDING-VENUES.md`, `assets/` (mark, wordmarks EN/AR, bands, badges, social backgrounds, icons). Localisation: Arabic dates and numerals via `ar-LB`, LBP beside USD when chosen, `address_ar`; accessibility: pinch-zoom allowed, contrast fixes, labelled inputs, `role=status` on results.

**Secrets that switch sandbox → live** (set on the Supabase functions unless noted): `PAYMENTS_MODE=live` + `PAYMENTS_PROVIDER` with `AREEBA_MERCHANT_ID` / `AREEBA_API_PASSWORD` / `AREEBA_GATEWAY_URL` (or `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`), `WHISH_CHANNEL` / `WHISH_SECRET` / `WHISH_WEBSITE_URL`; `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` (+ `WHATSAPP_OTP_TEMPLATE`, `WA_TPL_*`, `WHATSAPP_TEXT_MODE=1` until templates are approved, `SEND_SMS_HOOK_SECRET`); `RESEND_API_KEY` / `EMAIL_FROM`; `NOTIFY_SECRET`; `TICKET_SECRET`; `APP_URL`; on Vercel `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) and `NEXT_PUBLIC_SUPPORT_WA`. Full list at the bottom of `app/.env.example` and in `docs/DEPLOYMENT.md`.
