import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, fulfilOrder, PAYMENTS_MODE, APP_URL, SUPABASE_URL } from "./lib.ts";
import { startCheckout, configured, PROVIDER } from "./providers.ts";

/** Start payment for a pending order. Sandbox: marks it paid and issues tickets. Live: returns the provider's hosted-checkout URL. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);
  const b = await req.json().catch(() => null);
  if (!b?.order_id) return json({ error: "bad_request" }, 400);
  const db = admin();
  const { data: o } = await db.from("orders").select("id,status,total,credit_used,currency,payment_method,payment_ref,tenant_id,events(title)").eq("id", b.order_id).eq("buyer_id", user.id).maybeSingle();
  if (!o) return json({ error: "order" }, 404);
  if (o.status === "paid") return json({ status: "paid", order_id: o.id });
  if (o.status !== "pending") return json({ error: "state", status: o.status }, 409);
  const due = Math.round((Number(o.total) - Number(o.credit_used ?? 0)) * 100) / 100;

  if (PAYMENTS_MODE === "sandbox" || due <= 0 || !configured(o.payment_method === "whish" ? "whish" : PROVIDER)) {
    if (PAYMENTS_MODE !== "sandbox" && due > 0) return json({ error: "provider_not_configured", provider: PROVIDER }, 503);
    const { tickets, status } = await fulfilOrder(db, o.id);
    await db.from("orders").update({ payment_ref: `sandbox:${Date.now()}` }).eq("id", o.id);
    return json({ status, order_id: o.id, sandbox: true, tickets: tickets.map((t: any) => ({ id: t.id, code: t.code, token: t.token, seat: t.seat, state: t.state })) });
  }
  const { data: prof } = await db.from("profiles").select("email,phone").eq("id", user.id).single();
  try {
    const c = await startCheckout(
      { id: o.id, total: Number(o.total), due, currency: o.currency, description: `WhatsUp · ${(o.events as any)?.title ?? "order"}`, buyer_email: prof?.email, buyer_phone: prof?.phone },
      { success: `${APP_URL}/checkout/done?order=${o.id}`, cancel: `${APP_URL}/checkout/pay?order=${o.id}&cancelled=1`, webhook: `${SUPABASE_URL}/functions/v1/payment-webhook` },
      o.payment_method,
    );
    await db.from("orders").update({ payment_ref: `${c.provider}:${c.ref}` }).eq("id", o.id);
    return json({ status: "pending", order_id: o.id, checkout_url: c.url, provider: c.provider });
  } catch (e) {
    return json({ error: "checkout_failed", detail: String((e as Error).message) }, 502);
  }
});
