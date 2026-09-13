import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, verifyToken } from "./lib.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);
  const b = await req.json().catch(() => null);
  if (!b?.token || !b?.event_id) return json({ error: "bad_request" }, 400);
  const db = admin();

  const { data: ev } = await db.from("events").select("id,organiser_id,title").eq("id", b.event_id).single();
  if (!ev) return json({ error: "event" }, 404);
  const { data: mem } = await db.from("memberships").select("role").eq("user_id", user.id).eq("organiser_id", ev.organiser_id).in("role", ["organiser", "door", "country_admin", "super_admin"]);
  if (!(mem && mem.length)) return json({ error: "forbidden" }, 403);

  const record = async (ticket_id: string | null, result: string) => {
    if (ticket_id) await db.from("scans").insert({ ticket_id, event_id: ev.id, device_id: b.device_id ?? null, scanned_by: user.id, result });
  };

  const id = await verifyToken(String(b.token));
  if (!id) return json({ result: "invalid", reason: "bad_signature" });
  const { data: tk } = await db.from("tickets").select("id,event_id,state,code,seat,scanned_at,tier_id,holder_id").eq("id", id).single();
  if (!tk || tk.event_id !== ev.id) { await record(tk?.id ?? null, "invalid"); return json({ result: "invalid", reason: tk ? "wrong_event" : "unknown" }); }
  if (tk.state === "scanned") { await record(tk.id, "duplicate"); return json({ result: "duplicate", code: tk.code, seat: tk.seat, scanned_at: tk.scanned_at }); }
  if (tk.state === "void" || tk.state === "transferred") { await record(tk.id, "void"); return json({ result: "void", code: tk.code, state: tk.state }); }
  if (tk.state === "reserved") { await record(tk.id, "invalid"); return json({ result: "reserved", code: tk.code, reason: "pay_at_door_first" }); }

  const { data: flipped } = await db.from("tickets").update({ state: "scanned", scanned_at: new Date().toISOString() }).eq("id", tk.id).eq("state", "valid").select("id");
  if (!flipped || !flipped.length) { await record(tk.id, "duplicate"); return json({ result: "duplicate", code: tk.code }); }
  await record(tk.id, "valid");
  const { data: tier } = await db.from("tiers").select("name").eq("id", tk.tier_id).single();
  const { data: holder } = await db.from("profiles").select("name").eq("id", tk.holder_id).single();
  return json({ result: "valid", code: tk.code, seat: tk.seat, tier: tier?.name, holder: holder?.name ?? null });
});
