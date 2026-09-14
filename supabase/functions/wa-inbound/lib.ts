// Canonical copy of the helper module that each edge function bundles as ./lib.ts
// (Supabase deploys one folder per function, so the file is duplicated per function: `npm run sync-lib` in supabase/).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TICKET_SECRET = Deno.env.get("TICKET_SECRET") ?? SERVICE_KEY;
export const APP_URL = (Deno.env.get("APP_URL") ?? "https://whatsup-ticketing-app.vercel.app").replace(/\/$/, "");
export const PAYMENTS_MODE = Deno.env.get("PAYMENTS_MODE") ?? "sandbox";

export type Db = SupabaseClient;
export const admin = (): Db => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
export const asUser = (req: Request): Db =>
  createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-notify-secret", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
export const cors = () => new Response("ok", { headers: CORS });
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- tokens
// WU1.<ticket_id>.<sig>            static token printed in the QR (saved images, PDFs, offline wallets)
// WU2.<ticket_id>.<slot>.<sig>     rotating token minted on the holder's device every 2 minutes from the ticket's rot_key
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function hmacWith(secret: string, data: string, len = 22): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(data))).slice(0, len);
}
const hmac = (data: string) => hmacWith(TICKET_SECRET, data);
export async function signTicket(ticketId: string): Promise<string> { return `WU1.${ticketId}.${await hmac(ticketId)}`; }
export async function rotKey(ticketId: string): Promise<string> { return hmacWith(TICKET_SECRET, `${ticketId}:rot`, 32); }
export const SLOT_SECONDS = 120;
export const slotNow = () => Math.floor(Date.now() / 1000 / SLOT_SECONDS);
/** Returns the ticket id when the token verifies, plus whether it was a rotating token. */
export async function verifyToken(token: string): Promise<{ id: string; rotating: boolean } | null> {
  const parts = token.trim().split(".");
  if (parts[0] === "WU1" && parts.length === 3) {
    const [, id, sig] = parts;
    return (await hmac(id)) === sig ? { id, rotating: false } : null;
  }
  if (parts[0] === "WU2" && parts.length === 4) {
    const [, id, slotS, sig] = parts;
    const slot = Number(slotS);
    if (!Number.isFinite(slot) || Math.abs(slot - slotNow()) > 1) return null; // ±2 minutes
    const key = await rotKey(id);
    return (await hmacWith(key, `${id}.${slot}`)) === sig ? { id, rotating: true } : null;
  }
  return null;
}
export const claimCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(8)); for (const x of r) s += a[x % a.length]; return s; };

// ---------------------------------------------------------------- fulfilment (shared by create-order in sandbox and by payment-webhook in live mode)
/** Issue the tickets for an order and mark it paid. Idempotent: an order that is already paid returns its tickets. */
export async function fulfilOrder(db: Db, orderId: string, opts: { reserved?: boolean } = {}) {
  const { data: order } = await db.from("orders").select("*, order_lines(*)").eq("id", orderId).single();
  if (!order) throw new Error("order");
  const { data: existing } = await db.from("tickets").select("id,code,token,seat,state,tier_id").eq("order_id", orderId);
  const status: "paid" | "reserved" = opts.reserved ? "reserved" : "paid";
  if (existing && existing.length) {
    if (order.status === "reserved" && status === "paid") {
      await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
      await db.from("tickets").update({ state: "valid" }).eq("order_id", orderId).eq("state", "reserved");
      for (const l of order.order_lines.filter((x: any) => x.tier_id)) await db.rpc("confirm_sale", { p_tier: l.tier_id, p_qty: l.qty });
    }
    return { order, tickets: existing, status };
  }
  const { data: ev } = await db.from("events").select("id,kind,tenant_id,organiser_id,title").eq("id", order.event_id).single();
  const tierIds = order.order_lines.map((l: any) => l.tier_id).filter(Boolean);
  const { data: tiers } = tierIds.length ? await db.from("tiers").select("*").in("id", tierIds) : { data: [] as any[] };
  const tableLine = order.order_lines.find((l: any) => l.table_id);
  const { data: table } = tableLine ? await db.from("tables_vip").select("*").eq("id", tableLine.table_id).single() : { data: null };
  const meta = order.meta ?? {};
  const seats: string[] = meta.seats ?? [];
  const resale: Record<string, string[]> = meta.resale ?? {};

  const tickets: any[] = [];
  let seatIdx = 0;
  for (const l of order.order_lines.filter((x: any) => x.tier_id)) {
    const t = (tiers ?? []).find((x: any) => x.id === l.tier_id);
    if (!t) continue;
    const months = t.kind === "pass" ? Number(t.plan_months ?? 1) : 0;
    const validUntil = months ? new Date(new Date().setMonth(new Date().getMonth() + months)).toISOString() : null;
    const count = t.kind === "stay" ? 1 : l.qty;
    for (let i = 0; i < count; i++) {
      const { data: code } = await db.rpc("gen_ticket_code");
      const id = crypto.randomUUID();
      tickets.push({ id, tenant_id: order.tenant_id, order_id: order.id, event_id: order.event_id, tier_id: t.id, holder_id: order.buyer_id, code, token: await signTicket(id), rot_key: await rotKey(id), seat: seats[seatIdx++] ?? null, state: status === "paid" ? "valid" : "reserved", valid_until: validUntil, recipient: meta.gift ? { name: meta.gift.name ?? null, phone: meta.gift.phone ?? null } : null });
    }
  }
  if (table && !tickets.length) {
    const { data: code } = await db.rpc("gen_ticket_code");
    const id = crypto.randomUUID();
    tickets.push({ id, tenant_id: order.tenant_id, order_id: order.id, event_id: order.event_id, tier_id: null, holder_id: order.buyer_id, code, token: await signTicket(id), rot_key: await rotKey(id), seat: table.name, state: status === "paid" ? "valid" : "reserved" });
  }
  if (tickets.length) {
    const { error } = await db.from("tickets").insert(tickets);
    if (error) throw new Error("tickets_insert: " + error.message);
  }
  // resale pool: the seller's ticket is sold back and their face value becomes fan credit
  for (const [tierId, ids] of Object.entries(resale)) {
    if (!ids.length) continue;
    const { data: sold } = await db.from("tickets").update({ state: "sold_back", sold_back_at: new Date().toISOString() }).in("id", ids).in("state", ["resale", "reserved"]).select("id,holder_id");
    const t = (tiers ?? []).find((x: any) => x.id === tierId);
    for (const s of sold ?? []) {
      if (s.holder_id && t) await db.rpc("add_credit", { p_user: s.holder_id, p_amount: Number(t.face_price) });
      await db.from("message_log").insert({ tenant_id: order.tenant_id, user_id: s.holder_id, channel: "whatsapp", template: "sold_back", payload: { event: ev?.title, amount: Number(t?.face_price ?? 0) } });
    }
  }
  if (status === "paid") {
    for (const l of order.order_lines.filter((x: any) => x.tier_id && !(resale[x.tier_id]?.length >= x.qty))) {
      const fromPool = resale[l.tier_id]?.length ?? 0;
      if (l.qty - fromPool > 0) await db.rpc("confirm_sale", { p_tier: l.tier_id, p_qty: l.qty - fromPool });
    }
  }
  await db.from("orders").update({ status, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", order.id);
  if (ev?.kind === "event") {
    const { data: remaining } = await db.from("tiers").select("capacity,sold,held").eq("event_id", ev.id);
    if (remaining && remaining.length && remaining.every((t: any) => t.sold + t.held >= t.capacity)) await db.from("events").update({ status: "sold_out" }).eq("id", ev.id);
  }
  // the friend who referred a first-time buyer earns $5 of fan credit once the order is paid
  if (status === "paid" && order.referral_code) {
    const { data: friend } = await db.from("profiles").select("id").eq("referral_code", order.referral_code).maybeSingle();
    if (friend) {
      await db.rpc("add_credit", { p_user: friend.id, p_amount: 5 });
      await db.from("profiles").update({ referred_by: friend.id }).eq("id", order.buyer_id).is("referred_by", null);
      await db.from("message_log").insert({ tenant_id: order.tenant_id, user_id: friend.id, channel: "whatsapp", template: "referral_credit", payload: { amount: 5 } });
    }
  }
  await db.from("message_log").insert({ tenant_id: order.tenant_id, user_id: order.buyer_id, channel: "whatsapp", template: status === "paid" ? "ticket_delivery" : "reservation", payload: { order_id: order.id, event: ev?.title, tickets: tickets.map((t) => t.code), gift: meta.gift ?? null, total: order.total } });
  return { order, tickets, status };
}
