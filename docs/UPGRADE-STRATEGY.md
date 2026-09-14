# What's Up — Upgrade Strategy v1.0 (shipped in app v0.5.0, 14 Sep 2026)

How the monetisation model from Project Brief v2.0 (§ Monetisation) and the money model in tracker §10 became the product's upgrade ladder. Everything below is live in the app in sandbox mode; the ledger, settlements and statements already account for it.

## 1. Principle

Nobody pays to *use* What's Up. Buyers pay a small fee inside an all-in price; organisers and venues pay only when they want more reach, more tools or a lower fee. Every rung is a real product screen, not a paywall, and every dollar posts to the ledger (`rev:tickets`, `rev:promotions`, `rev:services`) so partners can audit it.

## 2. The ladder

### Buyers — fees inside the price, upgrades that feel like perks

| Rung | What it is | Where in the app | Money |
|---|---|---|---|
| Ticket / day pass / item | All-in price shown everywhere ("$26.75 all-in") | Listing → offer pickers → checkout | Buyer fee 5% + $0.50 (tickets), 5% (day passes, items), 4% (stays) → `rev:tickets`; organiser fee by plan |
| Table | Party size + time slot, no booking fee, deposit only where the venue asks | Listing (dining / venue) | No buyer fee; deposit credited to the bill |
| Pass / membership | Monthly / Season / Annual plan cards → black member card in the wallet; covers `member_free` offers at partner venues; scans every visit | Listing kind `pass`, Wallet | No buyer fee; monthly platform share is the venue's rule |
| Deals | Save to wallet → dashed coupon → Redeem once | Listing, Wallet | Free to list; venues pay for featured placement, not for the deal |
| Stream pass | 24-hour pass to a venue's paid station | Radio → station | `rev:services`, 70% to the venue |
| Referral | Friend gets 10% off the first order, referrer gets $5 credit on scan | Profile → code, `/?ref=CODE` | `referral_marketing` account |

### Organisers and venues — Free → Pro → Venue

| | Free | Pro — $49 / month | Venue — negotiated |
|---|---|---|---|
| Organiser fee | 3% | 2.5% | 2% |
| Listings, tickets, tables, QR door, cash at door, weekly payouts, WhatsApp delivery | ✓ | ✓ | ✓ |
| Promoter links and commissions | — | ✓ | ✓ |
| Audience insights, buyer export, WhatsApp broadcast to past buyers | — | ✓ | ✓ |
| $20 featured-placement credit / month | — | ✓ | ✓ |
| Own live station (audio / video), passes and memberships, day passes and items | — | — | ✓ |
| Revenue-share rules, monthly statements, a person on WhatsApp | — | — | ✓ |

Pro is bought in the app (`/org/plan`, sandbox card) — `upgrade_plan()` posts a `service_charges` row of kind `organiser_plan` and sets `organisers.plan = 'pro'` for 30 days. Venue is negotiated by Kareem's team and set in the back office (Team / Partners). Gating is soft: a Free organiser opening Promoters sees the Pro card with the three features that unlock, one tap from upgrading.

### Media revenue — Promote packages per listing

| Package | Price | Days | Includes |
|---|---|---|---|
| Boost | $40 | 7 | Featured on Home (first card, ★ badge), top of its category |
| Story bundle | $120 | 7 | Boost + one Instagram Story on @whatsuplebanon + one TikTok cut + Story card with the promo link |
| Takeover | $300 | 14 | Story bundle + sponsored category header + WhatsApp broadcast to matching buyers + feed post + weekend-planner mention |

`buy_promotion()` inserts a paid `promotion_orders` row (ledger `rev:promotions`, revenue-share rules apply — e.g. a media partner's cut) and extends `events.featured_until`; Home sorts featured listings first. The content deliverables (Story, TikTok, post) are fulfilled by the WhatsUp Lebanon content team — the back office Orders / Promotions view is the work queue.

## 3. Take-rate arithmetic (unchanged from the brief)

$30 ticket → buyer pays $32.00 · buyer fee $2.00 · organiser fee $0.90 (Free) · processing ≈ $0.80 → platform gross ≈ $2.90, net ≈ $2.10 → blended 8–10% of gross ticket value. Plans and Promote packages are margin on top: a venue on Pro that buys one Boost a month contributes $89 before it sells a ticket.

## 4. What is still in front of the ladder

Payment partners (card acquirer, Whish, OMT reference flow) turn sandbox into revenue; the refund-protection add-on at checkout and ticket transfer / resale are the next buyer rungs; the WhatsApp broadcast and audience insights promised on Pro need the WhatsApp Business token that also unlocks OTP sign-in; the `ANTHROPIC_API_KEY` on Vercel switches the concierge, vibe creator and poster-to-listing from catalogue rules to Claude.
