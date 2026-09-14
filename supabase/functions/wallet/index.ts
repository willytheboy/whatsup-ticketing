import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, signTicket, rotKey, claimCode, APP_URL } from "./lib.ts";

/** Wallet actions (brief §5.6 / §5.7).
 *  transfer      {ticket_id, name, phone}  → the ticket is re-issued with a new QR to the recipient; the old QR is dead
 *  claim         {claim_code}               → the recipient attaches a transferred ticket to their account
 *  sell_back     {ticket_id}                → list a ticket on the resale pool at face value (fan credit when it sells)
 *  unlist        {ticket_id}                → take it off the pool
 *  refund_request{order_id, reason}         → per the listing's refund policy or the refund-protection add-on
 *  keys          {ticket_ids}               → rotating-QR keys for tickets the caller holds
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);
  const b = await req.json().catch(() => null);
  if (!b?.action) return json({ error: "bad_request" }, 400);
  const db = admin();
  const mine = async (id: string) => {
    const { data: t } = await db.from("tickets").select("*, tiers(name,kind,face_price), events(id,title,slug,starts_at,doors_at,tenant_id,refund_policy)").eq("id", id).eq("holder_id", user.id).maybeSingle();
    return t;
  };
  const normPhone = (p: string) => p.replace(/[^\d+]/g, "").replace(/^00/, "+").replace(/^0/, "+961").replace(/^(?!\+)/, "+");

  if (b.action === "keys") {
    const ids: string[] = Array.isArray(b.ticket_ids) ? b.ticket_ids.slice(0, 50) : [];
    const { data: rows } = await db.from("tickets").select("id,rot_key").in("id", ids).eq("holder_id", user.id);
    const out: Record<string, string> = {};
    for (const r of rows ?? []) {
      let k = r.rot_key;
      if (!k) { k = await rotKey(r.id); await db.from("tickets").update({ rot_key: k }).eq("id", r.id); }
      out[r.id] = k;
    }
    return json({ keys: out });
  }

  if (b.action === "transfer") {
    const t = await mine(b.ticket_id);
    if (!t) return json({ error: "ticket" }, 404);
    if (t.state !== "valid") return json({ error: "state", state: t.state }, 409);
    const name = String(b.name ?? "").trim(); const phone = normPhone(String(b.phone ?? ""));
    if (!name || phone.length < 8) return json({ error: "recipient" }, 400);
    const { data: recipient } = await db.from("profiles").select("id,name").eq("phone", phone).neq("id", user.id).maybeSingle();
    const id = crypto.randomUUID(); const code = (await db.rpc("gen_ticket_code")).data; const claim = claimCode();
    const { error } = await db.from("tickets").insert({ id, tenant_id: t.tenant_id, order_id: t.order_id, event_id: t.event_id, tier_id: t.tier_id, holder_id: recipient?.id ?? null, code, token: await signTicket(id), rot_key: await rotKey(id), seat: t.seat, state: "valid", valid_until: t.valid_until, transferred_from: t.id, recipient: { name, phone }, claim_code: recipient ? null : claim });
    if (error) return json({ error: "insert", detail: error.message }, 500);
    await db.from("tickets").update({ state: "transferred" }).eq("id", t.id);
    const link = recipient ? `${APP_URL}/wallet` : `${APP_URL}/claim/${claim}`;
    await db.from("message_log").insert({ tenant_id: t.tenant_id, user_id: recipient?.id ?? null, channel: "whatsapp", template: "transfer", payload: { to: phone, name, from: user.user_metadata?.name ?? null, event: t.events?.title, starts_at: t.events?.starts_at, code, link, claim_code: recipient ? null : claim } });
    return json({ ok: true, ticket_id: id, code, claimed: !!recipient, link });
  }

  if (b.action === "claim") {
    const claim = String(b.claim_code ?? "").toUpperCase().trim();
    const { data: t } = await db.from("tickets").select("id,code,event_id,recipient,holder_id,events(title,slug,starts_at)").eq("claim_code", claim).maybeSingle();
    if (!t) return json({ error: "claim" }, 404);
    if (t.holder_id && t.holder_id !== user.id) return json({ error: "claimed" }, 409);
    await db.from("tickets").update({ holder_id: user.id, claim_code: null }).eq("id", t.id);
    return json({ ok: true, ticket_id: t.id, code: t.code, event: t.events });
  }

  if (b.action === "sell_back" || b.action === "unlist") {
    const t = await mine(b.ticket_id);
    if (!t) return json({ error: "ticket" }, 404);
    if (b.action === "sell_back") {
      if (t.state !== "valid") return json({ error: "state", state: t.state }, 409);
      if (!t.tier_id || ["pass", "stay"].includes(t.tiers?.kind)) return json({ error: "kind" }, 400);
      if (t.events?.starts_at && new Date(t.events.starts_at) < new Date()) return json({ error: "ended" }, 409);
      await db.from("tickets").update({ state: "resale", resale_listed_at: new Date().toISOString() }).eq("id", t.id);
      const { data: n } = await db.rpc("notify_waitlist", { p_tier: t.tier_id, p_reason: "resale" });
      return json({ ok: true, state: "resale", face: Number(t.tiers?.face_price ?? 0), notified: n ?? 0 });
    }
    if (t.state !== "resale") return json({ error: "state", state: t.state }, 409);
    await db.from("tickets").update({ state: "valid", resale_listed_at: null }).eq("id", t.id);
    return json({ ok: true, state: "valid" });
  }

  if (b.action === "refund_request") {
    const { data: o } = await db.from("orders").select("id,status,total,addons,refund_status,event_id,tenant_id,events(title,starts_at,doors_at,refund_policy,organiser_id)").eq("id", b.order_id).eq("buyer_id", user.id).maybeSingle();
    if (!o) return json({ error: "order" }, 404);
    if (o.status !== "paid") return json({ error: "state", state: o.status }, 409);
    if (o.refund_status) return json({ error: "already", refund_status: o.refund_status }, 409);
    const ev: any = o.events; const policy = ev?.refund_policy ?? {}; const doors = new Date(ev?.doors_at ?? ev?.starts_at);
    const protectedOrder = (o.addons ?? []).some((a: any) => a.kind === "refund_protection");
    let allowed = false;
    if (protectedOrder) allowed = doors.getTime() > Date.now();
    else if (policy.type === "until_hours_before") allowed = doors.getTime() - Number(policy.hours ?? 24) * 3600e3 > Date.now();
    else if (policy.type === "flexible") allowed = doors.getTime() > Date.now();
    if (!allowed) return json({ error: "policy", policy, protected: protectedOrder }, 409);
    await db.from("orders").update({ refund_status: "requested", refund_requested_at: new Date().toISOString() }).eq("id", o.id);
    await db.from("message_log").insert({ tenant_id: o.tenant_id, user_id: user.id, channel: "whatsapp", template: "refund_requested", payload: { order_id: o.id, event: ev?.title, total: o.total, reason: String(b.reason ?? "").slice(0, 300), protected: protectedOrder } });
    // the organiser is told on WhatsApp too (their number lives on the organiser record)
    const { data: org } = await db.from("organisers").select("whatsapp,name").eq("id", ev?.organiser_id).maybeSingle();
    if (org?.whatsapp) await db.from("message_log").insert({ tenant_id: o.tenant_id, user_id: null, channel: "whatsapp", template: "refund_requested_org", payload: { to: org.whatsapp, order_id: o.id, event: ev?.title, total: o.total, reason: String(b.reason ?? "").slice(0, 300) } });
    return json({ ok: true, refund_status: "requested", auto: protectedOrder });
  }

  return json({ error: "action" }, 400);
});
