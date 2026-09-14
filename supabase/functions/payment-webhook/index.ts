import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, json, cors, fulfilOrder, APP_URL, PAYMENTS_MODE } from "./lib.ts";
import { confirmPaid } from "./providers.ts";

/** Provider callbacks (no JWT — each provider is verified its own way). Fulfils the order on a confirmed payment.
 *  ?provider=stripe   POST from Stripe, signature in stripe-signature (STRIPE_WEBHOOK_SECRET)
 *  ?provider=areeba   GET return URL → the gateway is asked for the order's status before anything is issued
 *  ?provider=whish    POST callback → the collect status is re-checked with Whish
 *  ?provider=sandbox  POST {order_id} with X-Sandbox-Secret (PAYMENTS_SANDBOX_SECRET) — test rigs only, and only while PAYMENTS_MODE=sandbox
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "";
  const orderParam = url.searchParams.get("order");
  const raw = req.method === "POST" ? await req.text() : "";
  const db = admin();

  if (provider === "sandbox") {
    const secret = Deno.env.get("PAYMENTS_SANDBOX_SECRET");
    if (PAYMENTS_MODE !== "sandbox" || !secret || req.headers.get("x-sandbox-secret") !== secret) return json({ error: "forbidden" }, 403);
    const b = JSON.parse(raw || "{}");
    const { tickets, status } = await fulfilOrder(db, b.order_id);
    return json({ ok: true, status, tickets: tickets.length });
  }

  let paid: { order_id: string; ref: string } | null = null;
  try { paid = await confirmPaid(provider, req, orderParam, raw); } catch (e) { return json({ error: "verify_failed", detail: String((e as Error).message) }, 400); }
  if (!paid) {
    if (req.method === "GET" && orderParam) return Response.redirect(`${APP_URL}/checkout/pay?order=${orderParam}&failed=1`, 302);
    return json({ received: true, paid: false });
  }
  const { data: o } = await db.from("orders").select("id,status").eq("id", paid.order_id).maybeSingle();
  if (!o) return json({ error: "order" }, 404);
  if (o.status === "pending") {
    await db.from("orders").update({ payment_ref: `${provider}:${paid.ref}` }).eq("id", o.id);
    await fulfilOrder(db, o.id);
  }
  if (req.method === "GET") return Response.redirect(`${APP_URL}/checkout/done?order=${o.id}`, 302);
  return json({ received: true, paid: true, order_id: o.id });
});
