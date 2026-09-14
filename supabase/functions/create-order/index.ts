import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, round2, fulfilOrder, PAYMENTS_MODE, APP_URL } from "./lib.ts";

/** Buyer fee by offer kind (design brief §4.3). Tenant defaults apply to tickets; the rest are fixed platform rules. */
function feeFor(kind: string, face: number, tenant: any): number {
  if (face <= 0) return 0;
  switch (kind) {
    case "ticket": return round2(face * Number(tenant.buyer_fee_pct) + Number(tenant.buyer_fee_fixed));
    case "daypass": case "item": return round2(face * Number(tenant.buyer_fee_pct));
    case "stay": return round2(face * 0.04);
    default: return 0; // pass, table, deal
  }
}
const TOTAL_CAP = 20;
const REFUND_PROTECTION_PCT = 0.08, REFUND_PROTECTION_MIN = 1;
const REFERRAL_WINDOW_DAYS = 30;

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
  const { data: ev } = await db.from("events").select("id,status,doors_at,starts_at,seated,tenant_id,kind,organiser_id,title,refund_policy").eq("id", b.event_id).single();
  if (!ev || ev.tenant_id !== tenant.id || !["live", "sold_out"].includes(ev.status)) return json({ error: "event_unavailable" }, 409);
  const methods: string[] = [...tenant.payment_methods, "credit"];
  if (!methods.includes(b.payment_method)) return json({ error: "payment_method" }, 400);

  const lines = b.lines.filter((l: any) => l.tier_id && l.qty > 0);
  const totalQty = lines.reduce((a: number, l: any) => a + l.qty, 0);
  if (totalQty > TOTAL_CAP) return json({ error: "per_order_limit" }, 400);
  if (!lines.length && !b.table_id) return json({ error: "bad_request" }, 400);
  const tierIds = lines.map((l: any) => l.tier_id);
  const { data: tiers } = tierIds.length ? await db.from("tiers").select("*").in("id", tierIds).eq("event_id", ev.id) : { data: [] as any[] };
  if (!tiers || tiers.length !== tierIds.length) return json({ error: "tier" }, 400);
  const now = new Date();
  for (const l of lines) {
    const t = tiers.find((x) => x.id === l.tier_id)!;
    if (t.sale_starts && new Date(t.sale_starts) > now) return json({ error: "sale_not_started", tier: t.id }, 409);
    if (t.sale_ends && new Date(t.sale_ends) < now) return json({ error: "sale_ended", tier: t.id }, 409);
    if (l.qty > (t.per_order_limit ?? 6)) return json({ error: "per_order_limit", tier: t.id }, 400);
  }

  // A valid pass covers member_free offers (day passes at partner venues)
  const { data: passRows } = await db.from("tickets").select("id,valid_until,tiers!inner(kind)").eq("holder_id", user.id).in("state", ["valid", "scanned"]).eq("tiers.kind", "pass");
  const hasPass = (passRows ?? []).some((p: any) => !p.valid_until || new Date(p.valid_until) > now);

  // Inventory: hold from the tier; when the tier is sold out, fulfil from the resale pool (tickets listed with "sell back").
  // Pay-later orders (cash at the door, OMT) never draw on the pool: the seller must be paid out when the buyer pays.
  const payLater = b.payment_method === "cash_door" || b.payment_method === "omt";
  const held: { tier_id: string; qty: number }[] = [];
  const resale: Record<string, string[]> = {};
  const releaseAll = async () => {
    for (const h of held) await db.rpc("release_hold", { p_tier: h.tier_id, p_qty: h.qty });
    for (const ids of Object.values(resale)) if (ids.length) await db.from("tickets").update({ state: "resale" }).in("id", ids).eq("state", "reserved");
  };
  for (const l of lines) {
    const { data: ok } = await db.rpc("hold_tickets", { p_tier: l.tier_id, p_qty: l.qty });
    if (ok) { held.push({ tier_id: l.tier_id, qty: l.qty }); continue; }
    if (payLater) { await releaseAll(); return json({ error: "sold_out", tier: l.tier_id }, 409); }
    const { data: pool } = await db.from("tickets").select("id").eq("tier_id", l.tier_id).eq("state", "resale").order("resale_listed_at").limit(l.qty);
    if (!pool || pool.length < l.qty) { await releaseAll(); return json({ error: "sold_out", tier: l.tier_id }, 409); }
    // park the pool tickets while the buyer pays (an expired order puts them back on sale)
    const ids = pool.map((p) => p.id);
    const { data: parked } = await db.from("tickets").update({ state: "reserved" }).in("id", ids).eq("state", "resale").select("id");
    if (!parked || parked.length < l.qty) { if (parked?.length) await db.from("tickets").update({ state: "resale" }).in("id", parked.map((p) => p.id)); await releaseAll(); return json({ error: "sold_out", tier: l.tier_id }, 409); }
    resale[l.tier_id] = ids;
  }

  let table: any = null;
  if (b.table_id) {
    const { data: t } = await db.from("tables_vip").select("*").eq("id", b.table_id).eq("event_id", ev.id).is("reserved_by_order", null).single();
    if (!t) { await releaseAll(); return json({ error: "table_unavailable" }, 409); }
    table = t;
  }
  const pkg = table && b.package_id ? (table.packages ?? []).find((p: any) => p.id === b.package_id) : null;

  let face = 0, fee = 0;
  const priced: any[] = [];
  for (const l of lines) {
    const t = tiers.find((x) => x.id === l.tier_id)!;
    const covered = !!t.member_free && hasPass;
    const unitFace = covered ? 0 : Number(t.face_price);
    const unitFee = feeFor(t.kind ?? "ticket", unitFace, tenant);
    face += unitFace * l.qty; fee += unitFee * l.qty;
    priced.push({ tier: t, qty: l.qty, unitFace, unitFee, seats: l.seats ?? [], covered });
  }

  // Codes: a promo code discounts; a promoter code attributes; a friend's referral code gives 10% off the first order (30-day window)
  let discount = 0, promo: any = null, promoterCode: string | null = null, referralCode: string | null = null;
  if (b.promo_code) {
    const { data: p } = await db.from("promo_codes").select("*").eq("tenant_id", tenant.id).eq("code", String(b.promo_code).toUpperCase()).eq("active", true).maybeSingle();
    const valid = p && (!p.event_id || p.event_id === ev.id) && (!p.max_uses || p.uses < p.max_uses) && (!p.starts_at || new Date(p.starts_at) <= now) && (!p.ends_at || new Date(p.ends_at) >= now);
    if (!valid) { await releaseAll(); return json({ error: "promo_invalid" }, 400); }
    promo = p; discount = round2(p.pct_off ? face * Number(p.pct_off) / 100 : Math.min(face, Number(p.fixed_off ?? 0)));
  }
  const ref = String(b.referral_code ?? b.promoter_code ?? "").toUpperCase().trim();
  const refAt = b.referral_at ? new Date(b.referral_at) : now;
  if (ref && (now.getTime() - refAt.getTime()) < REFERRAL_WINDOW_DAYS * 86400e3) {
    const { data: pr } = await db.from("promoters").select("code").eq("tenant_id", tenant.id).eq("code", ref).maybeSingle();
    if (pr) promoterCode = pr.code;
    else {
      const { data: friend } = await db.from("profiles").select("id").eq("referral_code", ref).neq("id", user.id).maybeSingle();
      if (friend) {
        referralCode = ref;
        const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", user.id).in("status", ["paid", "reserved"]);
        if (!count && !promo) discount = round2(face * 0.1);
      }
    }
  }

  // Add-ons: refund protection (brief §5.4) — the buyer can cancel for any reason until doors
  const addons: { kind: string; amount: number }[] = [];
  if (b.refund_protection && face > 0) addons.push({ kind: "refund_protection", amount: round2(Math.max(REFUND_PROTECTION_MIN, face * REFUND_PROTECTION_PCT)) });
  const addonTotal = addons.reduce((a, x) => a + x.amount, 0);

  const deposit = table ? Number(table.deposit) : 0;
  const pkgPrice = pkg ? Number(pkg.price ?? 0) : 0;
  const tableFace = deposit + pkgPrice;
  let total = round2(face + fee + tableFace + addonTotal - discount);
  const organiser_fee = round2(face * Number(tenant.organiser_fee_pct));

  // Fan credit pays first when the buyer chose it (or has some) — the remainder goes to the chosen method
  let creditUsed = 0;
  const { data: prof } = await db.from("profiles").select("credit,lang,phone,email").eq("id", user.id).single();
  const credit = Number(prof?.credit ?? 0);
  if (b.payment_method === "credit") {
    if (credit < total) { await releaseAll(); return json({ error: "credit_short", credit, total }, 400); }
    creditUsed = total;
  } else if (b.use_credit && credit > 0) creditUsed = Math.min(credit, total);
  const due = round2(total - creditUsed);
  const processing_fee = ["card", "whish"].includes(b.payment_method) && due > 0 ? round2(due * Number(tenant.processing_pct)) : 0;

  const reserve = (b.payment_method === "cash_door" || b.payment_method === "omt") && due > 0;
  const holdExpires = reserve
    ? new Date(new Date(ev.doors_at ?? ev.starts_at).getTime() - Number(tenant.cash_hold_hours_before_doors) * 3600e3)
    : new Date(Date.now() + Number(tenant.checkout_hold_minutes) * 60e3);
  const meta = { party: b.party ?? null, time: b.time ?? null, nights: b.nights ?? null, checkin: b.checkin ?? null, gift: b.gift ?? null, covered: priced.some((p) => p.covered), seats: priced.flatMap((p) => p.seats), resale, package: pkg ? { id: pkg.id, name: pkg.name, price: pkgPrice } : null, squad_id: b.squad_id ?? null };

  const { data: order, error: oerr } = await db.from("orders").insert({
    tenant_id: tenant.id, event_id: ev.id, buyer_id: user.id, status: "pending", payment_method: b.payment_method,
    currency: tenant.base_currency, fx_rate: tenant.fx_rate, face_total: round2(face), buyer_fee: round2(fee), discount, table_deposit: tableFace, credit_used: creditUsed,
    total, organiser_fee, processing_fee, addons,
    fee_snapshot: { buyer_fee_pct: tenant.buyer_fee_pct, buyer_fee_fixed: tenant.buyer_fee_fixed, organiser_fee_pct: tenant.organiser_fee_pct, processing_pct: tenant.processing_pct, kinds: priced.map((p) => p.tier.kind) },
    promo_code: promo?.code ?? null, promoter_code: promoterCode, referral_code: referralCode, hold_expires_at: holdExpires.toISOString(), meta,
  }).select().single();
  if (oerr || !order) { await releaseAll(); return json({ error: "order_insert", detail: oerr?.message }, 500); }

  await db.from("order_lines").insert([
    ...priced.map((p) => ({ order_id: order.id, tier_id: p.tier.id, qty: p.qty, unit_face: p.unitFace, unit_fee: p.unitFee })),
    ...(table ? [{ order_id: order.id, table_id: table.id, qty: 1, unit_face: tableFace, unit_fee: 0 }] : []),
  ]);
  if (table) await db.from("tables_vip").update({ reserved_by_order: order.id }).eq("id", table.id);
  if (promo) await db.from("promo_codes").update({ uses: promo.uses + 1 }).eq("id", promo.id);
  if (creditUsed > 0) await db.rpc("add_credit", { p_user: user.id, p_amount: -creditUsed });
  if (b.squad_id) await db.rpc("squad_pay_share", { p_id: b.squad_id, p_order: order.id });

  // Live payments: hand the buyer to the provider's hosted checkout; the payment-webhook function fulfils on success
  if (PAYMENTS_MODE !== "sandbox" && !reserve && due > 0) {
    return json({ order_id: order.id, status: "pending", total, due, currency: tenant.base_currency, next: "pay", pay_url: `${APP_URL}/checkout/pay?order=${order.id}` }, 202);
  }

  const { tickets, status } = await fulfilOrder(db, order.id, { reserved: reserve });
  return json({ order_id: order.id, status, total, due, credit_used: creditUsed, currency: tenant.base_currency, lbp: Math.round(total * Number(tenant.fx_rate) / 1000) * 1000, addons, tickets: tickets.map((t: any) => ({ id: t.id, code: t.code, token: t.token, seat: t.seat, state: t.state })) }, 201);
});
