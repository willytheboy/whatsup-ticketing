# Founding Venues programme

The first twenty venues on WhatsUp Lebanon set the tone for everyone who follows. This is the offer we make them, what we ask in return, and how it runs inside the product.

## The offer

A founding venue gets the **Venue plan free for six months** (organiser fee 2 %, its own station, passes and items, revenue-share rules, monthly statements and a person on WhatsApp), then Pro pricing for life ($49 a month, never the Venue rate) as long as it stays active. It gets a **$100 promotion credit** to spend on Boosts, Story bundles or a Takeover, a **founding badge** on its listings and its member card, and a slot in the launch campaign on @whatsuplebanon (836K followers): one Story and one feed post in the first month, produced by the WhatsUp editors from the venue's own photos.

Founding venues also shape the roadmap. Their WhatsApp group with the team is where features are asked for and shown first; the venue tools in this release (poster-to-listing, packages on tables, the resale pool, refund protection, the door scanner that works without signal) all came from those conversations.

## What we ask

Twenty venues, no more, chosen for spread: Beirut, Batroun, Jounieh, Jbeil, the mountains and the south; nightlife, dining, beach, stays and at least two festivals. Each commits to listing everything it sells on WhatsUp for the six months — tickets, tables, day passes, rooms, items and any pass — with WhatsUp as the only online box office for those listings, and to running the door on the WhatsUp scanner. Cash at the door stays welcome; it is settled in the weekly statement like everything else. Each venue nominates one person on WhatsApp who answers group bookings and refund requests within 48 hours (the app measures this and shows it on the listing).

## How it runs in the product

The programme is a plan and a flag, nothing bespoke. The back office sets the organiser to `venue` with `plan_until` six months out (Team → Plans); the founding badge is `organisers.verified` plus a `founding` key in the organiser's metadata, which the listing page and the member card read. The $100 credit is posted to the organiser's ledger as `rev:promotions` credit and consumed by `buy_promotion` before any card is charged. After six months the nightly plan sweep drops the organiser to `pro` at the founding rate; a `founding_rate` flag keeps the price at $49 when the standard Pro price changes.

Reporting is the normal organiser stats plus a Founding Venues row on the back-office Overview: listings live, gross, sell-through, WhatsApp response time and promotion credit remaining, per venue. The programme is reviewed at month three (drop-outs replaced from the waiting list) and month six (renewal on Pro).

## Timeline

Weeks 1–2: shortlist sixty, visit thirty, sign twenty. Week 3: onboarding evenings in Beirut and Batroun — every venue leaves with its listings live from posters and its door staff trained on the scanner. Week 4: launch campaign. Month 3: review. Month 6: renewal.
