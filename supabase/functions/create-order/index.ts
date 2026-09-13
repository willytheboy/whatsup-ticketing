import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, signTicket, round2 } from "./lib.ts";

const PAYMENTS_MODE = Deno.env.get("PAYMENTS_MODE") ?? "sandbox";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  const b = await req.json().catch(() => null);
  if (!b?.event_id || !Array.isArray(b.lines) || !b.payment_method) return json({ error: "bad_request" }, 400);
  const db = admin();

  const { data: tenant } = await db.from("tenants").select("*").eq("slug", b.tenant ?? "lb").single();
  if (!tenant) return json({ error: "tenant" }, 404);
  const { data: ev } = await db.from("events").select("id,status,doors_at,starts_at,seated,tenant_id").eq("id", b.event_id).single();
  if (!ev || ev.tenant_id !== tenant.id || !["live", "sold_out"].includes(ev.status)) return json({ error: "event_unavailable" }, 409);
  if (!tenant.payment_methods.includes(b.payment_method)) return json({ error: "payment_method" }, 400);

  const lines = b.lines.filter((l: any) => l.tier_id && l.qty > 0);
  const totalQty = lines.reduce((a: number, l: any) => a + l.qty, 0);
  if (totalQty > 6) return json({ error: "per_order_limit" }, 400);
  const tierIds = lines.map((l: any) => l.tier_id);
  const { data: tiers } = await db.from("tiers").select("*").in("id", tierIds).eq("event_id", ev.id);
  if (!tiers || tiers.length !== tierIds.length) return json({ error: "tier" }, 400);
  const now = new Date();
  for (const t of tiers) {
    if (t.sale_starts && new Date(t.sale_starts) > now) return json({ error: "sale_not_started", tier: t.id }, 409);
    if (t.sale_ends && new Date(t.sale_ends) < now) return json({ error: "sale_ended", tier: t.id }, 409);
  }

  const held: { tier_id: string; qty: number }[] = [];
  for (const l of lines) {
    const { data: ok } = await db.rpc("hold_tickets", { p_tier: l.tier_id, p_qty: l.qty });
    if (!ok) { for (const h of held) await db.rpc("release_hold", { p_tier: h.tier_id, p_qty: h.qty }); return json({ error: "sold_out", tier: l.tier_id }, 409); }
    held.push({ tier_id: l.tier_id, qty: l.qty });
  }
  const releaseAll = async () => { for (const h of held) await db.rpc("release_hold", { p_tier: h.tier_id, p_qty: h.qty }); };

  let table: any = null;
  if (b.table_id) {
    const { data: t } = await db.from("tables_vip").select("*").eq("id", b.table_id).eq("event_id", ev.id).is("reserved_by_order", null).single();
    if (!t) { await releaseAll(); return json({ error: "table_unavailable" }, 409); }
    table = t;
  }

  let face = 0, fee = 0;
  const priced: any[] = [];
  for (const l of lines) {
    const t = tiers.find((x) => x.id === l.tier_id)!;
    const unitFace = Number(t.face_price);
    const unitFee = unitFace === 0 ? 0 : round2(unitFace * Number(tenant.buyer_fee_pct) + Number(tenant.buyer_fee_fixed));
    face += unitFace * l.qty; fee += unitFee * l.qty;
    priced.push({ tier: t, qty: l.qty, unitFace, unitFee, seats: l.seats ?? [] });
  }
  let discount = 0, promo: any = null;
  if (b.promo_code) {
    const { data: p } = await db.from("promo_codes").select("*").eq("tenant_id", tenant.id).eq("code", String(b.promo_code).toUpperCase()).eq("active", true).maybeSingle();
    const valid = p && (!p.event_id || p.event_id === ev.id) && (!p.max_uses || p.uses < p.max_uses) && (!p.starts_at || new Date(p.starts_at) <= now) && (!p.ends_at || new Date(p.ends_at) >= now);
    if (!valid) { await releaseAll(); return json({ error: "promo_invalid" }, 400); }
    promo = p; discount = round2(p.pct_off ? face * Number(p.pct_off) / 100 : Math.min(face, Number(p.fixed_off ?? 0)));
  }
  const deposit = table ? Number(table.deposit) : 0;
  const total = round2(face + fee + deposit - discount);
  const organiser_fee = round2(face * Number(tenant.organiser_fee_pct));
  const processing_fee = ["card", "whish"].includes(b.payment_method) ? round2(total * Number(tenant.processing_pct)) : 0;

  const reserve = b.payment_method === "cash_door" || b.payment_method === "omt";
  const holdExpires = reserve
    ? new Date(new Date(ev.doors_at ?? ev.starts_at).getTime() - Number(tenant.cash_hold_hours_before_doors) * 3600e3)
    : new Date(Date.now() + Number(tenant.checkout_hold_minutes) * 60e3);

  const { data: order, error: oerr } = await db.from("orders").insert({
    tenant_id: tenant.id, event_id: ev.id, buyer_id: user.id, status: "pending", payment_method: b.payment_method,
    currency: tenant.base_currency, fx_rate: tenant.fx_rate, face_total: round2(face), buyer_fee: round2(fee), discount, table_deposit: deposit,
    total, organiser_fee, processing_fee,
    fee_snapshot: { buyer_fee_pct: tenant.buyer_fee_pct, buyer_fee_fixed: tenant.buyer_fee_fixed, organiser_fee_pct: tenant.organiser_fee_pct, processing_pct: tenant.processing_pct },
    promo_code: promo?.code ?? null, promoter_code: b.promoter_code ?? null, referral_code: b.referral_code ?? null, hold_expires_at: holdExpires.toISOString(),
  }).select().single();
  if (oerr || !order) { await releaseAll(); return json({ error: "order_insert", detail: oerr?.message }, 500); }

  await db.from("order_lines").insert([
    ...priced.map((p) => ({ order_id: order.id, tier_id: p.tier.id, qty: p.qty, unit_face: p.unitFace, unit_fee: p.unitFee })),
    ...(table ? [{ order_id: order.id, table_id: table.id, qty: 1, unit_face: deposit, unit_fee: 0 }] : []),
  ]);
  if (table) await db.from("tables_vip").update({ reserved_by_order: order.id }).eq("id", table.id);
  if (promo) await db.from("promo_codes").update({ uses: promo.uses + 1 }).eq("id", promo.id);

  const status: "paid" | "reserved" = reserve ? "reserved" : "paid";
  if (PAYMENTS_MODE !== "sandbox" && !reserve) {
    return json({ order_id: order.id, status: "pending", total, next: "payment_redirect_not_configured" }, 202);
  }

  const tickets: any[] = [];
  for (const p of priced) {
    for (let i = 0; i < p.qty; i++) {
      const { data: code } = await db.rpc("gen_ticket_code");
      const id = crypto.randomUUID();
      tickets.push({ id, tenant_id: tenant.id, order_id: order.id, event_id: ev.id, tier_id: p.tier.id, holder_id: user.id, code, token: await signTicket(id), seat: p.seats[i] ?? null, state: status === "paid" ? "valid" : "reserved" });
    }
  }
  if (tickets.length) await db.from("tickets").insert(tickets);
  for (const h of held) { if (status === "paid") await db.rpc("confirm_sale", { p_tier: h.tier_id, p_qty: h.qty }); }
  await db.from("orders").update({ status, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", order.id);
  const { data: remaining } = await db.from("tiers").select("capacity,sold,held").eq("event_id", ev.id);
  if (remaining && remaining.every((t) => t.sold + t.held >= t.capacity)) await db.from("events").update({ status: "sold_out" }).eq("id", ev.id);

  await db.from("message_log").insert({ tenant_id: tenant.id, user_id: user.id, channel: "whatsapp", template: status === "paid" ? "ticket_delivery" : "reservation", payload: { order_id: order.id, tickets: tickets.map((t) => t.code) } });

  return json({ order_id: order.id, status, total, currency: tenant.base_currency, lbp: Math.round(total * Number(tenant.fx_rate) / 1000) * 1000, tickets: tickets.map((t) => ({ id: t.id, code: t.code, token: t.token, seat: t.seat, state: t.state })) }, 201);
});
