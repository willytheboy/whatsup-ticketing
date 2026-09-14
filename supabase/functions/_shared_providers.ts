// Payment provider adapters (hosted checkout). Env-driven: PAYMENTS_PROVIDER picks one; with no credentials the platform stays in sandbox.
//   stripe  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                      (cards, Apple Pay / Google Pay)
//   areeba  AREEBA_MERCHANT_ID, AREEBA_API_PASSWORD, AREEBA_GATEWAY_URL     (Lebanese acquirer on the Mastercard Gateway hosted checkout)
//   whish   WHISH_CHANNEL, WHISH_SECRET, WHISH_WEBSITE_URL, WHISH_API_URL   (Whish Money collect)
// OMT is cash at a branch: the order stays reserved with a reference and is marked paid from the back office.
import { hmacWith } from "./lib.ts";

export type Checkout = { url: string; ref: string; provider: string };
export const PROVIDER = Deno.env.get("PAYMENTS_PROVIDER") ?? "sandbox";
const env = (k: string) => Deno.env.get(k) ?? "";
export const configured = (p = PROVIDER) =>
  p === "stripe" ? !!env("STRIPE_SECRET_KEY") : p === "areeba" ? !!(env("AREEBA_MERCHANT_ID") && env("AREEBA_API_PASSWORD")) : p === "whish" ? !!(env("WHISH_CHANNEL") && env("WHISH_SECRET")) : false;

type Order = { id: string; total: number; due: number; currency: string; description: string; buyer_email?: string | null; buyer_phone?: string | null };

/** Start a hosted checkout and return the URL to send the buyer to. */
export async function startCheckout(o: Order, urls: { success: string; cancel: string; webhook: string }, method: string): Promise<Checkout> {
  const provider = method === "whish" ? "whish" : PROVIDER;
  if (provider === "stripe") {
    const form = new URLSearchParams({
      mode: "payment", "line_items[0][price_data][currency]": o.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(Math.round(o.due * 100)),
      "line_items[0][price_data][product_data][name]": o.description, "line_items[0][quantity]": "1", success_url: urls.success, cancel_url: urls.cancel,
      client_reference_id: o.id, "metadata[order_id]": o.id, ...(o.buyer_email ? { customer_email: o.buyer_email } : {}),
    });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const s = await r.json();
    if (!r.ok || !s.url) throw new Error("stripe: " + (s.error?.message ?? r.status));
    return { url: s.url, ref: s.id, provider };
  }
  if (provider === "areeba") {
    const base = env("AREEBA_GATEWAY_URL") || "https://epayment.areeba.com"; const mid = env("AREEBA_MERCHANT_ID");
    const r = await fetch(`${base}/api/rest/version/100/merchant/${mid}/session`, {
      method: "POST", headers: { Authorization: "Basic " + btoa(`merchant.${mid}:${env("AREEBA_API_PASSWORD")}`), "Content-Type": "application/json" },
      body: JSON.stringify({ apiOperation: "INITIATE_CHECKOUT", interaction: { operation: "PURCHASE", returnUrl: `${urls.webhook}?provider=areeba&order=${o.id}`, cancelUrl: urls.cancel, merchant: { name: "WhatsUp" } }, order: { id: o.id, amount: o.due.toFixed(2), currency: o.currency, description: o.description } }),
    });
    const s = await r.json();
    if (!r.ok || !s.session?.id) throw new Error("areeba: " + (s.error?.explanation ?? r.status));
    return { url: `${base}/checkout/pay/${s.session.id}`, ref: s.session.id, provider };
  }
  if (provider === "whish") {
    const base = env("WHISH_API_URL") || "https://whish.money/itel-service/api";
    const r = await fetch(`${base}/payment/whish`, {
      method: "POST", headers: { channel: env("WHISH_CHANNEL"), secret: env("WHISH_SECRET"), websiteurl: env("WHISH_WEBSITE_URL"), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: o.due, currency: o.currency, invoice: o.description, externalId: o.id, successCallbackUrl: `${urls.webhook}?provider=whish&order=${o.id}`, failureCallbackUrl: `${urls.webhook}?provider=whish&order=${o.id}&failed=1`, successRedirectUrl: urls.success, failureRedirectUrl: urls.cancel }),
    });
    const s = await r.json();
    const url = s?.data?.collectUrl ?? s?.collectUrl;
    if (!r.ok || !url) throw new Error("whish: " + (s?.dialog?.message ?? r.status));
    return { url, ref: String(s?.data?.externalId ?? o.id), provider };
  }
  throw new Error("provider_not_configured");
}

/** Confirm with the provider that an order is paid (webhook or return URL). Never trusts the redirect alone. */
export async function confirmPaid(provider: string, req: Request, orderId: string | null, rawBody: string): Promise<{ order_id: string; ref: string } | null> {
  if (provider === "stripe") {
    const secret = env("STRIPE_WEBHOOK_SECRET"); const sig = req.headers.get("stripe-signature") ?? "";
    if (secret) {
      const t = /t=(\d+)/.exec(sig)?.[1]; const v1 = /v1=([a-f0-9]+)/.exec(sig)?.[1];
      if (!t || !v1) return null;
      const expected = await hmacHex(secret, `${t}.${rawBody}`);
      if (expected !== v1 || Math.abs(Date.now() / 1000 - Number(t)) > 600) return null;
    }
    const evt = JSON.parse(rawBody);
    if (evt.type !== "checkout.session.completed" || evt.data?.object?.payment_status !== "paid") return null;
    return { order_id: evt.data.object.metadata?.order_id ?? evt.data.object.client_reference_id, ref: evt.data.object.id };
  }
  if (provider === "areeba") {
    if (!orderId) return null;
    const base = env("AREEBA_GATEWAY_URL") || "https://epayment.areeba.com"; const mid = env("AREEBA_MERCHANT_ID");
    const r = await fetch(`${base}/api/rest/version/100/merchant/${mid}/order/${orderId}`, { headers: { Authorization: "Basic " + btoa(`merchant.${mid}:${env("AREEBA_API_PASSWORD")}`) } });
    const s = await r.json();
    return r.ok && s.result === "SUCCESS" && s.status === "CAPTURED" ? { order_id: orderId, ref: String(s.transaction?.[0]?.transaction?.id ?? s.id) } : null;
  }
  if (provider === "whish") {
    if (!orderId) return null;
    const base = env("WHISH_API_URL") || "https://whish.money/itel-service/api";
    const cur = new URL(req.url).searchParams.get("currency") ?? "USD";
    const r = await fetch(`${base}/payment/collect/status`, { method: "POST", headers: { channel: env("WHISH_CHANNEL"), secret: env("WHISH_SECRET"), websiteurl: env("WHISH_WEBSITE_URL"), "Content-Type": "application/json" }, body: JSON.stringify({ currency: cur, externalId: orderId }) });
    const s = await r.json();
    return r.ok && (s?.data?.collectStatus === "success" || s?.data?.status === "success") ? { order_id: orderId, ref: String(orderId) } : null;
  }
  return null;
}

async function hmacHex(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export { hmacWith };
