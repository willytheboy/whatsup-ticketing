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
| Thumb first, 44 px targets | `.btn`, `.chip`, `.tab`, `.list-btn`, `.slot` minimum heights |
| Reveal, don't gate | every screen renders signed-out; sign-in is asked at booking, in the wallet and in rooms |

## Tokens (`:root`)

`--g1 #3B6D11` · `--g2 #639922` · `--g3 #97C459` · `--g4 #EAF3DE` · `--red #E24B4A` · `--red-dark #A32D2D` · `--ink #000` · `--ink2 #444441` · `--ink3 #7A7975` · `--line #DDDBD3` · `--sand #F4F3EE` · amber `#B45309 / #FEF3C7`.
Radii: 14 cards (`--r`), 10 buttons and inputs (`--rb`), 999 chips, 18 tickets and member card (`--rt`). Page padding 18 px.
Legacy aliases (`--green`, `--surface`, `--muted`, …) keep the back office on the same palette.

## Components → classes

Card `.card` · Photo card `.photo` + `.badge` · Chip `.chip(.on)` · Button `.btn.red / .green / .line / .sm / .xs / .full` · Stepper `.qty` · Slot chip `.slot(.on/.off)` · Plan card `.plan(.on)` · Offer row `.offer(.sel/.pass/.sold)` · Meter `.meter` · Map card `.map` (`MapCard.tsx`) · Gift box `.gift` · Ticket card `.ticket` (`TicketCard.tsx`) · Member card `.member` · Coupon `.ticket.coupon` · Chat bubbles `.me / .bot(.think)` · Action chips `.acts` · Compose bar `.compose` · Pinned line `.pin` · Station tile `.station` · Player `.player` + `.play` · KPI tile `.kpi` · Sell-through `.sell` · Result banner `.result(.ok/.dup/.bad)` · Bottom sheet `.sheet` (`CityPill.tsx`) · Toast `.toast` (`Toast.tsx`) · Tab bar `.tabs` (`Shell.tsx`) · Form field `.field` · Drop zone `.drop` · Plan box `.planbox(.pro/.venue/.on)`.

The facet band is `components/Band.tsx` (`Facet` at 120 / 80 / 72 / 56 px, inline SVG, `preserveAspectRatio="none"`). Icons are `components/Icons.tsx` (1.7 px stroke).

## Navigation

Six tabs for everyone: Home · Search · Ask · Radio · Vibe · Wallet. Profile behind the avatar. Venue tools behind Profile → Venue, shown only to organiser / door / admin roles; the back office link only to admins. Tabs hide on checkout, ticket, story, room, login, new listing and promote.

Deep links: `/e/<slug>` opens a listing, `/?ref=<CODE>` stores a promoter or referral code (and counts the click), `/ask?q=` pre-asks the concierge.

## Not in v1 (from the brief's open questions and later phases)

Dark mode · squad / split-pay cards (the button toasts) · ticket transfer and resale pool (waitlist "Notify me" ships; resale copy is a placeholder) · seat maps · calendar sheet for stays (a date input for now) · push notifications (WhatsApp only).
