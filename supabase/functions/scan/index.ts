import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, verifyToken } from "./lib.ts";

/** Door scan. Tickets, day passes, items and table bookings are single use; passes (member cards) scan every visit until valid_until.
    A pass scanned at any partner venue is accepted: the event_id check applies to everything except passes. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);
  const b = await req.json().catch(() => null);
  if (!b?.token || !b?.event_id) return json({ error: "bad_request" }, 400);
  const db = admin();

  const { data: ev } = await db.from("events").select("id,organiser_id,title,tenant_id").eq("id", b.event_id).single();
  if (!ev) return json({ error: "event" }, 404);
  const { data: mem } = await db.from("memberships").select("role").eq("user_id", user.id).eq("organiser_id", ev.organiser_id).in("role", ["organiser", "door", "country_admin", "super_admin"]);
  if (!(mem && mem.length)) return json({ error: "forbidden" }, 403);

  const record = async (ticket_id: string | null, result: string) => {
    if (ticket_id) await db.from("scans").insert({ ticket_id, event_id: ev.id, device_id: b.device_id ?? null, scanned_by: user.id, result });
  };

  const id = await verifyToken(String(b.token));
  if (!id) return json({ result: "invalid", reason: "bad_signature" });
  const { data: tk } = await db.from("tickets").select("id,event_id,state,code,seat,scanned_at,tier_id,holder_id,valid_until,tiers(name,kind)").eq("id", id).single();
  if (!tk) { await record(null, "invalid"); return json({ result: "invalid", reason: "unknown" }); }
  const tier: any = tk.tiers;
  const kind = tier?.kind ?? (tk.tier_id ? "ticket" : "table");
  const { data: holder } = await db.from("profiles").select("name").eq("id", tk.holder_id).single();

  // Member card: repeat scans, any partner venue of the tenant, until valid_until
  if (kind === "pass") {
    if (tk.state === "void" || tk.state === "transferred") { await record(tk.id, "void"); return json({ result: "void", code: tk.code, state: tk.state }); }
    if (tk.state === "reserved") { await record(tk.id, "invalid"); return json({ result: "reserved", code: tk.code, reason: "pay_at_door_first" }); }
    if (tk.valid_until && new Date(tk.valid_until) < new Date()) { await record(tk.id, "expired"); return json({ result: "expired", code: tk.code, valid_until: tk.valid_until }); }
    await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id);
    await record(tk.id, "valid");
    return json({ result: "valid", kind, code: tk.code, tier: tier?.name, holder: holder?.name ?? null, valid_until: tk.valid_until, repeat: true });
  }

  if (tk.event_id !== ev.id) { await record(tk.id, "invalid"); return json({ result: "invalid", reason: "wrong_event" }); }
  if (tk.state === "scanned") { await record(tk.id, "duplicate"); return json({ result: "duplicate", kind, code: tk.code, seat: tk.seat, scanned_at: tk.scanned_at }); }
  if (tk.state === "void" || tk.state === "transferred") { await record(tk.id, "void"); return json({ result: "void", code: tk.code, state: tk.state }); }
  if (tk.state === "reserved") { await record(tk.id, "invalid"); return json({ result: "reserved", kind, code: tk.code, reason: "pay_at_door_first" }); }

  const { data: flipped } = await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id).eq("state", "valid").select("id");
  if (!flipped || !flipped.length) { await record(tk.id, "duplicate"); return json({ result: "duplicate", kind, code: tk.code }); }
  await record(tk.id, "valid");
  return json({ result: "valid", kind, code: tk.code, seat: tk.seat, tier: tier?.name ?? (kind === "table" ? tk.seat : null), holder: holder?.name ?? null });
});
