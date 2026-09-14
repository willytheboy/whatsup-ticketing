# WhatsUp public API v1

For POS systems, CRMs, accounting and door hardware. Read-only in v1; writes (issuing tickets from a POS, scanning) come in v2.

## Authentication

Create a key at **Venue dashboard → Developers** in the app (`/org/developers`). The key is shown once; it starts with `wu_` and is stored hashed. Send it on every request as `X-Api-Key: wu_…` (or `Authorization: Bearer wu_…`). Each key is scoped to one organiser and only ever returns that organiser's data. Revoke a key from the same page.

Base URL: `https://whatsup-ticketing-app.vercel.app/api/v1` (the tenant's app domain once one is attached). All responses are JSON; CORS is open for GET.

## Endpoints

`GET /events` — the organiser's listings (draft, live, sold out, ended; archived ones are excluded), each with its tiers and live `sold` / `held` counts.

```json
{ "events": [ { "id": "…", "slug": "sunset-sessions-rooftop", "title": "Sunset Sessions", "kind": "event", "status": "live", "starts_at": "2026-09-19T17:00:00+00:00", "venue": "The Roof", "city": "Beirut",
  "tiers": [ { "id": "…", "name": "Regular", "kind": "ticket", "face_price": 25, "capacity": 300, "sold": 194, "held": 0 } ] } ], "count": 1 }
```

`GET /events/{slug}` — one listing (slug or id). 404 when it is not this organiser's.

`GET /orders?since=2026-09-01T00:00:00Z` — orders on the organiser's listings created since the timestamp (default: last 30 days), newest first, with lines and ticket states.

```json
{ "orders": [ { "id": "…", "event_id": "…", "event": "Sunset Sessions", "status": "paid", "method": "card", "face_total": 50, "buyer_fee": 3.5, "total": 57.5, "paid_at": "…", "created_at": "…",
  "lines": [ { "tier_id": "…", "qty": 2, "unit_face": 25 } ], "tickets": [ { "code": "WU-B1DB-649", "state": "scanned", "scanned_at": "…" } ] } ], "count": 1, "since": "2026-09-01T00:00:00Z" }
```

Order `status` is one of `pending`, `paid`, `reserved` (pay at the door / OMT), `cancelled`, `refunded`, `expired`. Ticket `state` is one of `valid`, `scanned`, `reserved`, `transferred`, `resale`, `sold_back`, `void`.

Amounts are in the tenant's base currency (USD for Lebanon). `face_total` is what the organiser sells at; `buyer_fee` is paid on top by the buyer; `total` is what the buyer paid all-in.

## Webhooks

Add an HTTPS endpoint at **Developers → Webhooks**. WhatsUp POSTs a JSON body for each event you subscribe to and signs it:

```
POST https://your-system.example/whatsup
X-WhatsUp-Event: order.paid
X-WhatsUp-Signature: <hex HMAC-SHA256 of the raw body, keyed with the endpoint's secret>
{ "event": "order.paid", "data": { "order_id": "…", "event_id": "…", "total": 57.5, "face_total": 50, "method": "card", "paid_at": "…" }, "sent_at": "…" }
```

Events: `order.paid` (a new paid order, including pay-at-the-door orders once cash is collected) and `ticket.scanned` (`{ ticket_id, code, event_id, scanned_at }`). Verify the signature before trusting a delivery; respond 2xx within 10 seconds. Deliveries are attempted once and listed on the Developers page; use `GET /orders?since=` to catch up after downtime.

## Limits and errors

No hard rate limit in v1; keep polling to once a minute or use webhooks. `401 unauthorized` when the key is missing, malformed or revoked; `404 not_found` for a listing that is not yours; `500` with `{ "error": "…" }` on our side, safe to retry.

## Examples

```bash
curl -H "X-Api-Key: $WU_KEY" https://whatsup-ticketing-app.vercel.app/api/v1/events
curl -H "X-Api-Key: $WU_KEY" "https://whatsup-ticketing-app.vercel.app/api/v1/orders?since=$(date -u -d '-1 day' +%FT%TZ)"
```

```js
// verify a webhook (Node)
const crypto = require("crypto");
const ok = crypto.timingSafeEqual(Buffer.from(req.headers["x-whatsup-signature"], "hex"), crypto.createHmac("sha256", SECRET).update(rawBody).digest());
```
