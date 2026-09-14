# Design system (v1.0 — applied 14 Sep 2026)

Source of truth: `WhatsUp_App_Design_Brief_v1.md` and prototype `whatsup-prototype-v0.6.html` (project docs). Where they differ, the brief wins. This file records how the brief maps onto the code.

## Principles in code

| Brief | Where it lives |
| --- | --- |
| White canvas, colour from the facet band and photography | `globals.css` tokens; `Photo` in `components/Cards.tsx` (flat brand colour + faint facet when no photo) |
| Red is rationed: cedar + one primary action per screen | `.btn.red` is the only red control; `.badge.ev` for tickets |
| All-in, always | `allInKind()` / `unitFee()` in `lib/config.ts`; `create-order` applies the same table |
| Everything is Story-ready | `/story/[slug]` renders a 9:16 preview and a 1080×1920 PNG on device |
| Cash is first class | `OfferPicker` shows *Pay by card* and *Cash / Whish* as peers |
| One object, seven offers | `events.kind` + `tiers.kind` + `tables_vip` + `events.deals`; pickers in `OfferPicker.tsx` |
| Arabic-native | logical properties throughout; Lebanese dialect strings in `lib/i18n.ts`; `html[dir=rtl]` rules |
| Thumb first, 44 px targets | `.btn`, `.chip`, `.tab`, `.list-btn`, `.slot` minimum heights; pinch-zoom stays enabled (WCAG 1.4.4) |
| Reveal, don't gate | every screen renders signed-out; sign-in is asked at booking, in the wallet and in rooms |

## Tokens (`:root`)

`--g1 #3B6D11` · `--g2 #639922` · `--g3 #97C459` · `--g4 #EAF3DE` · `--red #E24B4A` · `--red-dark #A32D2D` · `--ink #000` · `--ink2 #444441` · `--ink3 #6B6A66` (brief: #7A7975, darkened to pass 4.5:1 on white) · `--line #DDDBD3` · `--sand #F4F3EE` · amber `#B45309 / #FEF3C7`.
Radii: 14 cards (`--r`), 10 buttons and inputs (`--rb`), 999 chips, 18 tickets and member card (`--rt`). Page padding 18 px.
Legacy aliases (`--green`, `--surface`, `--muted`, …) keep the back office on the same palette.

Since v0.7 the roles that used to be hard-coded are tokens too: `--on-red` / `--on-g1` / `--on-band` (text on the primary button, the green button and the facet band), `--page` (the ground behind the phone stage) and the band's own tones `--b1 --b2 --b3 --cedar --cedar2` (default: the greens and reds above). `Band.tsx`, `Logo.tsx`, the story card and the saved-ticket PNG read them at render time, so **every component follows the theme with no per-component work**.

## Themes (v0.7)

Four token sets live in `globals.css` as `html[data-theme=…]` blocks; the tenant's choice (`tenants.config.theme`, set at Back office → Settings) lands on `<html data-theme>` in `app/layout.tsx`. `?theme=volt` previews one in the current browser only (cookie set by the middleware; `?theme=tenant` clears it). Contrast is checked for each: primary-button text ≥ 4.5:1, band wordmark ≥ 3:1 (large text), body text ≥ 4.5:1.

| Theme | Idea | Primary button | Greens / band | Ground |
| --- | --- | --- | --- | --- |
| `cedar` (default) | the brand: white canvas, cedar greens, rationed red | `#E24B4A` white text | `#3B6D11 #639922 #97C459` | `#E9E8E2` |
| `volt` | acid lime + black with hot-magenta calls to action; loud, nightlife-first | `#E6007E` white text | `#65A30D #84CC16 #D9F99D`, black wordmark | `#E4EAD8` |
| `sunset` (Sunset Beirut) | teal sea, coral sun, peach sand; warm, works in daylight | `#D23A1A` white text | `#0F766E #0D9488 #5EEAD4` | `#F3DFCB` |
| `ultraviolet` | violet family with a lime primary button; dark-mode energy on a light canvas | `#C8F53A` **dark text** (`--on-red`) | `#5B21B6 #7C3AED #C4B5FD`, lime cedar | `#E3DDF5` |

Adding a fifth theme is one CSS block plus one entry in `THEMES` (`lib/features.ts`) and `THEME_COLOR` (`lib/themes.ts`).

## White label / rebrand checklist

The app is built to be re-skinned without touching components. When the rebranded copy is installed on another server:

1. **Back office → Settings → Brand**: name (EN/AR), country (EN/AR), Instagram handle, support WhatsApp, short-link host, tagline. Every UI string that mentions the built-in brand (What's Up, Lebanon, @whatsuplebanon, #WeAreLebanon, wul.app) is swapped at render time (`brandify()` in `lib/features.ts`), on the server and the client.
2. **Theme**: pick one of the four, or add a block in `globals.css` as above.
3. **Files**: `public/icons/*`, `public/apple-touch-icon.png`, `public/favicon.png`, `public/splash-1170x2532.png`, `public/manifest.webmanifest` (name, short_name, theme_color) and the vectors in `assets/brand/` (mark, wordmark EN/AR). `components/Logo.tsx` draws the mark from tokens, so it recolours by itself; replace it if the new brand has its own mark.
4. **Env**: `NEXT_PUBLIC_TENANT`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BACKOFFICE_URL`, `NEXT_PUBLIC_SUPPORT_WA`; `APP_URL` on the edge functions (printed in WhatsApp messages).
5. **Copy that is data, not code**: WhatsApp templates (`docs/WHATSAPP-TEMPLATES.md`) carry the brand name — re-submit them under the new name; the founding-venue and promotion package copy in `lib/i18n.ts` is brandified but worth a read.

## Components → classes

Card `.card` · Photo card `.photo` + `.badge` · Chip `.chip(.on)` · Button `.btn.red / .green / .line / .sm / .xs / .full` · Stepper `.qty` · Slot chip `.slot(.on/.off)` · Plan card `.plan(.on)` · Offer row `.offer(.sel/.pass/.sold)` · Meter `.meter` · Map card `.map` (`MapCard.tsx`) · Gift box `.gift` · Ticket card `.ticket` (`TicketCard.tsx`) · Member card `.member` · Coupon `.ticket.coupon` · Chat bubbles `.me / .bot(.think)` · Action chips `.acts` · Compose bar `.compose` · Pinned line `.pin` · Station tile `.station` · Player `.player` + `.play` · KPI tile `.kpi` · Sell-through `.sell` · Result banner `.result(.ok/.dup/.bad)` · Bottom sheet `.sheet` (`CityPill.tsx`) · Toast `.toast` (`Toast.tsx`) · Tab bar `.tabs` (`Shell.tsx`) · Form field `.field` · Drop zone `.drop` · Plan box `.planbox(.pro/.venue/.on)`.

The facet band is `components/Band.tsx` (`Facet` at 120 / 80 / 72 / 56 px, inline SVG, `preserveAspectRatio="none"`). Icons are `components/Icons.tsx` (1.7 px stroke).

## Navigation

Six tabs for everyone: Home · Search · Ask · Radio · Vibe · Wallet. Profile behind the avatar. Venue tools behind Profile → Venue, shown only to organiser / door / admin roles; the back office link only to admins. Tabs hide on checkout, ticket, story, room, login, new listing and promote.

Deep links: `/e/<slug>` opens a listing, `/?ref=<CODE>` stores a promoter or referral code (and counts the click), `/ask?q=` pre-asks the concierge.

## Added in v0.6.0

Live QR (rotating token, 2-minute slots) on ticket and member cards · ticket actions sheet (save image, calendar, transfer, sell back, refund, squad) · calendar sheet for stays · table packages picker · refund-protection add-on and fan-credit rows at checkout · squad page · claim page · listing editor with tabs (basics / offers / tables / deals / refunds) and cover upload · promo codes, insights, refunds, developers pages · door scanner with counters, offline badge, lookup and "mark paid" · For-you row and heart · settings for currency, WhatsApp, email copies, data export and account deletion · back-office queues (promotions, moments, tenants, errors) and flags.

## Added in v0.7.0

Real photography on every listing (CC-licensed, credited on the card and the hero) and on stations, the story card and the vibe card · four themes · tenant settings (tabs, features, brand) · add-ons at checkout (`⚡ Extras` block, per order or per ticket) · pricing tab in the listing editor (pace, projection, one-tap flash code) · door lockout and the Fraud & door page · 30-day forecast on Reports.

## Not in v1

Dark mode · seat maps · push notifications (WhatsApp only) · native wallet passes (Apple / Google) need signing certificates.
