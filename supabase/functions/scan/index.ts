import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, verifyToken } from "./lib.ts";

/** Door scan (brief §5.12).
 *  - tickets, items and table bookings are single use; day passes scan once per calendar day; member passes scan every visit until valid_until
 *  - WU1 static tokens and WU2 rotating tokens (±2 min) are both accepted; the response says which
 *  - a table booking scanned at the door releases its hold: the deposit is reported so the floor knows it comes off the bill
 *  - actions: {action:"collect", order_id} marks a pay-at-the-door order paid; {action:"sync", scans:[…]} replays an offline queue;
 *    {action:"manifest"} returns the event's ticket list for offline checks; {action:"lookup", q} finds a ticket by code or name
 *  - v7 access first: an entry QR admits `admits` people (a cabana admits six, a table its party); a service QR (items, rentals, kits)
 *    is a pickup, never an entry — it is refused with `entry_first` until the holder's entrance has been scanned, and never counts
 *    in the checked-in figure. A one-day pass used on a previous day is `expired`.
 */
const roleOf = (t: any, kind: string) => (t?.role ?? (kind === "item" ? "service" : "access")) as "access" | "service";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);
  const b = await req.json().catch(() => null);
  if (!b?.event_id) return json({ error: "bad_request" }, 400);
  const db = admin();

  const { data: ev } = await db.from("events").select("id,organiser_id,title,tenant_id,kind,starts_at,tenants(config)").eq("id", b.event_id).single();
  if (!ev) return json({ error: "event" }, 404);
  // tenant feature flags (tenants.config.features); anything unset is on
  const tenantFeature = (e: any, k: string) => e?.tenants?.config?.features?.[k] !== false;
  const { data: mem } = await db.from("memberships").select("role").eq("user_id", user.id).eq("organiser_id", ev.organiser_id).in("role", ["organiser", "door", "country_admin", "super_admin"]);
  if (!(mem && mem.length)) return json({ error: "forbidden" }, 403);

  const record = async (ticket_id: string | null, result: string, at?: string) => {
    if (ticket_id) await db.from("scans").insert({ ticket_id, event_id: ev.id, device_id: b.device_id ?? null, scanned_by: user.id, result, scanned_at: at ?? new Date().toISOString(), synced_at: new Date().toISOString() });
  };
  const beirutDay = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });

  // ---- door actions
  if (b.action === "collect") {
    const { data: ok, error } = await db.rpc("door_collect", { p_order: b.order_id });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: !!ok });
  }
  if (b.action === "manifest") {
    const { data: rows } = await db.from("tickets").select("id,code,token,state,seat,scanned_at,valid_until,tier_id,holder_id,order_id,tiers(name,kind,role,admits),orders(meta),holder:profiles!holder_id(name)").eq("event_id", ev.id).in("state", ["valid", "scanned", "reserved"]);
    const { data: counts } = await db.from("tiers").select("id,name,kind,role,admits,capacity,sold").eq("event_id", ev.id);
    const tickets = (rows ?? []).map((r: any) => {
      const kind = r.tiers?.kind ?? (r.tier_id ? "ticket" : "table");
      const role = roleOf(r.tiers, kind);
      const admits = role === "service" ? 0 : kind === "table" ? Math.max(1, Number(r.orders?.meta?.party ?? 1)) : Number(r.tiers?.admits ?? 1);
      return { id: r.id, code: r.code, token: r.token, state: r.state, seat: r.seat, scanned_at: r.scanned_at, valid_until: r.valid_until, tier: r.tiers?.name ?? null, kind, role, admits, holder: r.holder?.name ?? null, holder_id: r.holder_id, order_id: r.order_id };
    });
    return json({ event: { id: ev.id, title: ev.title }, at: new Date().toISOString(), tickets, entries: tickets.filter((t) => t.role === "access").length, services: tickets.filter((t) => t.role === "service").length, tiers: counts ?? [] });
  }
  if (b.action === "lookup") {
    const q = String(b.q ?? "").trim();
    if (q.length < 3) return json({ tickets: [] });
    const { data: byCode } = await db.from("tickets").select("id,code,state,seat,token,tiers(name,kind,role,admits),holder:profiles!holder_id(name,phone)").eq("event_id", ev.id).ilike("code", `%${q}%`).limit(10);
    const { data: byName } = await db.from("tickets").select("id,code,state,seat,token,tiers(name,kind,role,admits),holder:profiles!holder_id!inner(name,phone)").eq("event_id", ev.id).or(`name.ilike.%${q}%,phone.ilike.%${q}%`, { referencedTable: "holder" }).limit(10);
    const seen = new Set<string>(); const out: any[] = [];
    for (const r of [...(byCode ?? []), ...(byName ?? [])] as any[]) if (!seen.has(r.id)) { seen.add(r.id); const k = r.tiers?.kind ?? "ticket"; out.push({ id: r.id, code: r.code, state: r.state, seat: r.seat, token: r.token, tier: r.tiers?.name, kind: k, role: roleOf(r.tiers, k), admits: r.tiers?.admits ?? 1, holder: r.holder?.name ?? null }); }
    return json({ tickets: out });
  }
  if (b.action === "sync") {
    // offline queue: [{token, at, result}] — accept scans made while the device was offline, in order
    const results: any[] = [];
    for (const s of (b.scans ?? []).slice(0, 500)) {
      const v = await verifyToken(String(s.token ?? "")).catch(() => null);
      const id = v?.id ?? (String(s.token ?? "").startsWith("WU") ? null : s.ticket_id ?? null);
      if (!id) { results.push({ token: s.token, result: "invalid" }); continue; }
      const { data: tk } = await db.from("tickets").select("id,event_id,state,code,tier_id,tiers(kind,role)").eq("id", id).single();
      if (!tk || (tk.event_id !== ev.id && (tk.tiers as any)?.kind !== "pass")) { results.push({ token: s.token, result: "invalid" }); continue; }
      const svc = roleOf(tk.tiers, (tk.tiers as any)?.kind ?? (tk.tier_id ? "ticket" : "table")) === "service";
      if (tk.state === "valid" || (tk.tiers as any)?.kind === "pass") {
        // the device checked the entrance against its manifest while offline; a service replays as a pickup, not an entry
        await db.from("tickets").update({ state: "scanned", scanned_at: s.at ?? new Date().toISOString() }).eq("id", tk.id).in("state", ["valid", "scanned"]);
        await record(tk.id, svc ? "service" : "valid", s.at); results.push({ token: s.token, code: tk.code, result: svc ? "service" : "valid" });
      } else if (tk.state === "scanned") { await record(tk.id, "duplicate", s.at); results.push({ token: s.token, code: tk.code, result: "duplicate" }); }
      else { await record(tk.id, "invalid", s.at); results.push({ token: s.token, code: tk.code, result: tk.state }); }
    }
    return json({ synced: results.length, results });
  }

  // ---- a scan
  if (!b.token) return json({ error: "bad_request" }, 400);
  const v = await verifyToken(String(b.token));
  if (!v) return json({ result: "invalid", reason: String(b.token).startsWith("WU2") ? "expired_token" : "bad_signature" });
  const id = v.id;
  const { data: tk } = await db.from("tickets").select("id,event_id,state,code,seat,scanned_at,tier_id,holder_id,valid_until,order_id,recipient,tiers(name,kind,role,admits,note),orders(addons,meta)").eq("id", id).single();
  if (!tk) { await record(null, "invalid"); return json({ result: "invalid", reason: "unknown" }); }
  const tier: any = tk.tiers;
  const kind = tier?.kind ?? (tk.tier_id ? "ticket" : "table");
  const { data: holder } = tk.holder_id ? await db.from("profiles").select("name").eq("id", tk.holder_id).single() : { data: null };
  const holderName = holder?.name ?? (tk.recipient as any)?.name ?? null;
  // v0.7: listing add-ons bought with the order (fast lane, parking…) so the door can act on them
  const addons = (((tk as any).orders?.addons ?? []) as any[]).filter((a) => a.kind === "addon").map((a) => ({ id: a.id, name: a.name, qty: a.qty }));
  const role = roleOf(tier, kind);
  const admits = role === "service" ? 0 : kind === "table" ? Math.max(1, Number((tk as any).orders?.meta?.party ?? 1)) : Number(tier?.admits ?? 1);
  const base = { kind, role, admits, code: tk.code, seat: tk.seat, tier: tier?.name ?? (kind === "table" ? tk.seat : null), holder: holderName, rotating: v.rotating, addons, note: tier?.note ?? null };

  // v0.7: door lockout — a ticket frozen after repeated duplicate scans stays out until a manager releases it
  const { data: lock } = await db.from("ticket_locks").select("reason,locked_at").eq("ticket_id", tk.id).is("released_at", null).maybeSingle();
  if (lock) { await record(tk.id, "locked"); return json({ result: "locked", ...base, reason: lock.reason, locked_at: lock.locked_at }); }

  // Member card: repeat scans, any partner venue of the tenant, until valid_until
  if (kind === "pass") {
    if (tk.state === "void" || tk.state === "transferred" || tk.state === "sold_back") { await record(tk.id, "void"); return json({ result: "void", ...base, state: tk.state }); }
    if (tk.state === "reserved") { await record(tk.id, "invalid"); return json({ result: "reserved", ...base, reason: "pay_at_door_first", order_id: tk.order_id }); }
    if (tk.valid_until && new Date(tk.valid_until) < new Date()) { await record(tk.id, "expired"); return json({ result: "expired", ...base, valid_until: tk.valid_until }); }
    await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id);
    await record(tk.id, "valid");
    return json({ result: "valid", ...base, valid_until: tk.valid_until, repeat: true });
  }

  if (tk.event_id !== ev.id) { await record(tk.id, "invalid"); return json({ result: "invalid", reason: "wrong_event", ...base }); }
  if (tk.state === "void" || tk.state === "transferred" || tk.state === "sold_back" || tk.state === "resale") { await record(tk.id, "void"); return json({ result: "void", ...base, state: tk.state }); }
  if (tk.state === "reserved") { await record(tk.id, "invalid"); return json({ result: "reserved", ...base, reason: "pay_at_door_first", order_id: tk.order_id }); }

  // Service QR (v7): a pickup inside the venue — only after the holder's entrance has been scanned
  if (role === "service") {
    if (tk.state === "scanned") { await record(tk.id, "duplicate"); return json({ result: "duplicate", ...base, scanned_at: tk.scanned_at }); }
    const today = beirutDay(new Date());
    // an entrance for this listing scanned by the same holder (same order first, then any of their orders)
    const { data: entries } = await db.from("tickets").select("id,order_id,scanned_at,tier_id,tiers(kind,role)").eq("event_id", ev.id).eq("holder_id", tk.holder_id).eq("state", "scanned");
    let entered = (entries ?? []).some((e: any) => {
      const k = e.tiers?.kind ?? (e.tier_id ? "ticket" : "table");
      if (roleOf(e.tiers, k) !== "access") return false;
      return k !== "daypass" || (e.scanned_at && beirutDay(e.scanned_at) === today);
    });
    if (!entered) {
      // or a membership that covers this venue, scanned today
      const { data: evv } = await db.from("events").select("venue_id").eq("id", ev.id).single();
      const { data: passes } = await db.from("tickets").select("id,scanned_at,tiers!inner(kind),events!inner(pass_venue_ids,tenant_id)").eq("holder_id", tk.holder_id).eq("state", "scanned").eq("tiers.kind", "pass");
      entered = (passes ?? []).some((p: any) => p.scanned_at && beirutDay(p.scanned_at) === today && p.events?.tenant_id === ev.tenant_id && (p.events?.pass_venue_ids == null || (evv?.venue_id && p.events.pass_venue_ids.includes(evv.venue_id))));
    }
    if (!entered) { await record(tk.id, "entry_first"); return json({ result: "entry_first", ...base, reason: "scan_entry_first", order_id: tk.order_id }); }
    const { data: flippedSvc } = await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id).eq("state", "valid").select("id");
    if (!flippedSvc || !flippedSvc.length) { await record(tk.id, "duplicate"); return json({ result: "duplicate", ...base }); }
    await record(tk.id, "service");
    return json({ result: "service", ...base });
  }

  // Day pass: once per calendar day (Beirut) — a second scan the same day is a duplicate, a new day is a fresh visit
  if (kind === "daypass") {
    if (tk.state === "scanned" && tk.scanned_at && beirutDay(tk.scanned_at) === beirutDay(new Date())) { await record(tk.id, "duplicate"); return json({ result: "duplicate", ...base, scanned_at: tk.scanned_at }); }
    if (tk.valid_until && new Date(tk.valid_until) < new Date()) { await record(tk.id, "expired"); return json({ result: "expired", ...base, valid_until: tk.valid_until }); }
    // a one-day pass (no valid_until) used on an earlier day is spent
    if (!tk.valid_until && tk.state === "scanned" && tk.scanned_at) { await record(tk.id, "expired"); return json({ result: "expired", ...base, reason: "used", scanned_at: tk.scanned_at }); }
    await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id);
    await record(tk.id, "valid");
    return json({ result: "valid", ...base, repeat: true });
  }

  if (tk.state === "scanned") {
    await record(tk.id, "duplicate");
    const { count } = await db.from("scans").select("id", { count: "exact", head: true }).eq("ticket_id", tk.id).eq("result", "duplicate");
    // three duplicates in ten minutes freeze the ticket (tenant feature fraud_lockout; default on)
    let locked = false;
    if (tenantFeature(ev, "fraud_lockout")) { const { data: l } = await db.rpc("lock_ticket_if_abused", { p_ticket: tk.id }); locked = !!l; }
    return json({ result: "duplicate", ...base, scanned_at: tk.scanned_at, attempts: count ?? 1, locked });
  }

  const { data: flipped } = await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id).eq("state", "valid").select("id");
  if (!flipped || !flipped.length) { await record(tk.id, "duplicate"); return json({ result: "duplicate", ...base }); }
  await record(tk.id, "valid");

  // Table booking: the hold is released on arrival and the deposit comes off the bill
  let deposit: number | null = null, party: number | null = null;
  if (kind === "table" && tk.order_id) {
    const { data: o } = await db.from("orders").select("table_deposit,meta").eq("id", tk.order_id).single();
    deposit = o ? Number(o.table_deposit) : null; party = (o?.meta as any)?.party ?? null;
  }
  return json({ result: "valid", ...base, deposit, party });
});
