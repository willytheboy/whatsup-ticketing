# WhatsUp Ticketing — project tracker

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

* **rev 19 (2026-09-13)** — repo rebuilt and pushed as v0.4.0; git-linked Vercel projects created and READY; tracker moved into the repo.
* rev 18 and earlier — in the project chat (not recoverable here).
