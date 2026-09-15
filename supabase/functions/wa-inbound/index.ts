import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, asUser, json, cors, APP_URL, round2 } from "./lib.ts";

/** WhatsApp-native selling (next phase, item 1). Meta Cloud API webhook for the business number:
 *  people write "what's on Friday in Batroun under $30", "2 tickets for the rooftop", "my tickets", "refund", "talk to someone",
 *  and the concierge answers from the live catalogue — with Claude when ANTHROPIC_API_KEY is set on this function, with plain
 *  rules otherwise — and hands them a one-tap checkout link (the listing opens with the tier and quantity preset).
 *
 *  GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…   Meta's verification handshake (WHATSAPP_VERIFY_TOKEN)
 *  POST Meta payload (signed with X-Hub-Signature-256 when WHATSAPP_APP_SECRET is set)
 *  POST {test:true, from:"96170000000", text:"…", lang?:"ar"} — simulates an inbound message; needs X-Notify-Secret, the service key,
 *       or a tenant admin's user JWT (the back office "Try the concierge" box)
 *
 *  Replies go out as free-form text through the Cloud API (allowed inside the 24-hour window the person just opened); without
 *  WHATSAPP_TOKEN they are written to message_log as "sandbox" so the back office can read the conversation.
 *  Deploy with --no-verify-jwt (Meta calls it without a user session).
 */
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN"); const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY"); const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const TENANT = Deno.env.get("TENANT") ?? "lb";

type Tier = { id: string; name: string; name_ar: string | null; face_price: number; capacity: number; sold: number; held: number; kind: string; per_order_limit: number | null; sort: number; role?: string; admits?: number; requires_access?: boolean };
// access first (v6): the bot quotes and books entries; a service is offered together with the cheapest entrance
const isEntry = (t: Tier) => (t.role ?? (t.kind === "item" ? "service" : "access")) === "access";
type L = { id: string; slug: string; title: string; title_ar: string | null; category: string; kind: string; starts_at: string; status: string; tiers: Tier[]; venues: { name: string; name_ar: string | null; city: string } | null; deals: any[]; tables_vip: any[] };

const FEES: Record<string, [number, number]> = { ticket: [0.05, 0.5], daypass: [0.05, 0], item: [0.05, 0], stay: [0.04, 0], pass: [0, 0], table: [0, 0] };
const allIn = (kind: string, face: number) => (face <= 0 ? 0 : round2(face + face * (FEES[kind]?.[0] ?? 0.05) + (FEES[kind]?.[1] ?? 0)));
const left = (t: Tier) => Math.max(0, Number(t.capacity) - Number(t.sold) - Number(t.held));
const money = (n: number) => (n === 0 ? "free" : `$${n.toFixed(2).replace(/\.00$/, "")}`);
const when = (iso: string, lang: string) => new Date(iso).toLocaleString(lang === "ar" ? "ar-LB" : "en-GB", { timeZone: "Asia/Beirut", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const title = (l: L, lang: string) => (lang === "ar" && l.title_ar ? l.title_ar : l.title);
const lowest = (l: L) => { const e = l.tiers.filter((t) => t.kind !== "pass" && left(t) > 0 && isEntry(t)); return (e.length ? e : l.tiers.filter((t) => t.kind !== "pass" && left(t) > 0 && t.requires_access === false)).map((t) => allIn(t.kind, Number(t.face_price))).sort((a, b) => a - b)[0]; };
/** A service tier needs an entrance: pair it with the cheapest entry on sale (null when the service needs none). */
const entryFor = (l: L, t: Tier): Tier | null => (isEntry(t) || t.requires_access === false ? null : l.tiers.filter((x) => x.kind !== "pass" && left(x) > 0 && isEntry(x)).sort((a, b) => Number(a.face_price) - Number(b.face_price))[0] ?? null);

async function catalogue(db: any, tenantId: string): Promise<L[]> {
  const { data } = await db.from("events").select("id,slug,title,title_ar,category,kind,starts_at,status,deals,tiers(id,name,name_ar,face_price,capacity,sold,held,kind,per_order_limit,sort,role,admits,requires_access),tables_vip(id,name,seats,reserved_by_order),venues(name,name_ar,city)")
    .eq("tenant_id", tenantId).in("status", ["live", "sold_out"]).or(`kind.neq.event,starts_at.gte.${new Date(Date.now() - 864e5).toISOString()}`).order("starts_at").limit(60);
  return (data ?? []) as L[];
}
const line = (l: L, lang: string) => {
  const p = lowest(l);
  const w = l.kind === "event" ? when(l.starts_at, lang) : lang === "ar" ? "يومياً" : "open daily";
  return `${title(l, lang)} — ${w}${l.venues ? ` · ${lang === "ar" && l.venues.name_ar ? l.venues.name_ar : l.venues.name}` : ""}${p !== undefined ? ` · ${lang === "ar" ? "من" : "from"} ${money(p)}` : ""}\n${APP_URL}/e/${l.slug}`;
};

const INTENT: [RegExp, (l: L) => boolean][] = [
  [/table|dinner|restaurant|eat|عشا|طاولة|مطعم|أكل/i, (l) => l.kind === "venue" && (l.tables_vip ?? []).some((x) => !x.reserved_by_order)],
  [/beach|sunbed|swim|pool|بحر|سباحة|مسبح/i, (l) => l.category === "Beach" || l.tiers.some((x) => x.kind === "daypass")],
  [/\bstay|overnight|nights?\s+(in|at|away)|hotel|guest ?house|sleep|mountain|إقامة|غرفة|جبل|فندق/i, (l) => l.kind === "stay"],
  [/pass|member|اشتراك|عضوية/i, (l) => l.kind === "pass"],
  [/free|ببلاش|مجان/i, (l) => l.tiers.some((x) => Number(x.face_price) === 0)],
  [/music|dj|party|concert|dance|rooftop|techno|house|disco|rave|club|night out|سهرة|حفلة|موسيقى|رقص|تكنو/i, (l) => l.category === "Music"],
  [/comedy|theatre|show|مسرح|كوميديا/i, (l) => ["Comedy", "Theatre"].includes(l.category)],
  [/hike|run|sport|outdoor|مشي|رياضة/i, (l) => ["Outdoors", "Sport", "Sports"].includes(l.category)],
  [/food|market|souk|harvest|أكل|سوق/i, (l) => ["Food", "Dining"].includes(l.category)],
];
const STOP = new Set(["the", "for", "and", "with", "please", "book", "want", "need", "tickets", "ticket", "get", "give", "this", "that", "there", "some", "any", "near", "from", "what", "whats", "anything", "something", "tonight", "today", "weekend", "under", "less", "than", "max", "people", "persons", "seats", "pax", "بدي", "شي", "في", "على", "إلى", "هالويكند", "الليلة"]);
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function pickFor(q: string, L: L[]): L[] {
  const words = q.toLowerCase().split(/[^\p{L}\p{N}$]+/u).filter((w) => w.length > 2 && !STOP.has(w));
  const hit = (hay: string, w: string) => new RegExp(`(^|[^\\p{L}])${esc(w)}($|[^\\p{L}])`, "u").test(hay);
  const intents = INTENT.filter(([re]) => re.test(q)).map(([, f]) => f);
  const budget = (() => { const m = q.match(/(?:under|below|less than|max|تحت|أقل من)\s*\$?\s*(\d+)|\$\s?(\d+)/i); const n = Number(m?.[1] ?? m?.[2]); return n > 0 ? n : 0; })();
  const day = /friday|الجمعة/i.test(q) ? 5 : /saturday|السبت/i.test(q) ? 6 : /sunday|الأحد/i.test(q) ? 0 : /tonight|today|الليلة|اليوم/i.test(q) ? new Date().getDay() : -1;
  const city = ["beirut", "batroun", "jounieh", "byblos", "jbeil", "tyre", "douma", "بيروت", "البترون", "جونيه", "جبيل", "صور"].find((c) => q.toLowerCase().includes(c));
  const ranked = L.map((l) => {
    const hay = [l.title, l.title_ar, l.category, l.kind, l.venues?.name, l.venues?.city, ...l.tiers.map((x) => `${x.kind} ${x.name}`)].filter(Boolean).join(" ").toLowerCase();
    let s = words.reduce((a, w) => a + (hit(hay, w) ? 2 : 0), 0) + intents.reduce((a, f) => a + (f(l) ? 3 : 0), 0) + (l.kind === "event" ? 0.5 : 0);
    const p = lowest(l);
    if (budget && p !== undefined) s += p <= budget ? 2 : -3;
    if (day >= 0 && l.kind === "event") s += new Date(l.starts_at).getDay() === day ? 3 : -4;
    if (city && (l.venues?.city ?? "").toLowerCase().includes(city.replace("jbeil", "byblos"))) s += 2;
    return { l, s };
  }).sort((a, b) => b.s - a.s);
  return (ranked[0]?.s ?? 0) > 0 ? ranked.filter((r) => r.s > 0).map((r) => r.l) : L.filter((l) => l.kind === "event").slice(0, 3);
}
const qtyIn = (q: string) => {
  if (/تذكرتين|تذكرتان|two tickets|a couple of tickets/i.test(q)) return 2;
  if (/\b(one|a) ticket\b|تذكرة وحدة|تذكرة واحدة/i.test(q)) return 1;
  const m = q.match(/(\d+)\s*(tickets?|people|persons?|pax|seats?|for\b|x\b|تذاكر|تذكرة|أشخاص|اشخاص)|for\s+(\d+)|لـ?\s?(\d+)\b/i); const n = Number(m?.[1] ?? m?.[3] ?? m?.[4]); return n > 0 && n <= 20 ? n : 0;
};

async function claude(system: string, content: string): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: "user", content }] }) });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.content ?? []).map((c: any) => c.text ?? "").join("").trim() || null;
  } catch { return null; }
}

async function sendText(db: any, tenantId: string, userId: string | null, phone: string, text: string): Promise<{ status: string; ref: string | null }> {
  if (WA_TOKEN && WA_PHONE_ID) {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text, preview_url: true } }) });
    const j = await res.json().catch(() => ({}));
    const status = res.ok ? "sent" : "failed";
    await db.from("message_log").insert({ tenant_id: tenantId, user_id: userId, channel: "whatsapp", template: "wa_reply", payload: { to: phone, text, error: j?.error?.message ?? null }, status, provider_ref: j?.messages?.[0]?.id ?? null });
    return { status, ref: j?.messages?.[0]?.id ?? null };
  }
  await db.from("message_log").insert({ tenant_id: tenantId, user_id: userId, channel: "whatsapp", template: "wa_reply", payload: { to: phone, text }, status: "sandbox" });
  return { status: "sandbox", ref: null };
}

async function verifySignature(req: Request, raw: string): Promise<boolean> {
  if (!APP_SECRET) return true;
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return sig === `sha256=${hex}`;
}

/** One inbound message → one reply. Returns the reply text (for tests). */
export async function handleMessage(db: any, tenant: any, phone: string, text: string, langHint?: string): Promise<{ reply: string; cart: any; handoff: boolean }> {
  const { data: prof } = await db.from("profiles").select("id,name,lang").or(`phone.eq.+${phone},phone.eq.${phone}`).maybeSingle();
  const { data: conv0 } = await db.from("wa_conversations").select("*").eq("phone", phone).maybeSingle();
  // the language follows the message itself (Arabic script → Arabic, Latin → English), then the conversation, then the profile
  const lang = langHint ?? (/[؀-ۿ]/.test(text) ? "ar" : /[A-Za-z]{2,}/.test(text) ? "en" : conv0?.lang ?? prof?.lang ?? "en");
  const ar = lang === "ar";
  const history: any[] = Array.isArray(conv0?.history) ? conv0.history.slice(-6) : [];
  const q = text.trim().slice(0, 500);
  const L = await catalogue(db, tenant.id);
  const wallet = `${APP_URL}/wallet`;
  let reply = "", cart: any = conv0?.cart ?? null, handoff = !!conv0?.handoff;

  // a human was asked for: stay quiet until the team clears the flag, except for a plain "back"
  if (handoff && !/^(back|bot|رجاع|بوت)$/i.test(q)) {
    await db.from("wa_conversations").upsert({ phone, tenant_id: tenant.id, user_id: prof?.id ?? null, lang, history: [...history, { who: "user", text: q, at: new Date().toISOString() }], messages: (conv0?.messages ?? 0) + 1, last_in_at: new Date().toISOString(), updated_at: new Date().toISOString(), handoff: true, cart });
    return { reply: "", cart, handoff: true };
  }
  if (/^(back|bot|رجاع|بوت)$/i.test(q)) handoff = false;

  if (/human|person|someone|agent|help me|talk to|شخص|حدا|موظف|بدي احكي/i.test(q)) {
    handoff = true;
    reply = ar ? "تمام — حدا من الفريق بيرد عليك هون بأقرب وقت. اكتب «بوت» لترجع للمساعد." : "Sure — someone from the team will reply here shortly. Write \"bot\" to come back to the assistant.";
  } else if (/my tickets?|wallet|\bqr\b|where.*ticket|(^|\s)(تذاكري|تذكرتي|محفظتي)(\s|$|[؟?.!])/i.test(q)) {
    if (prof) {
      const { data: tk } = await db.from("tickets").select("code,state,events(title,title_ar,starts_at)").eq("holder_id", prof.id).in("state", ["valid", "reserved"]).order("created_at", { ascending: false }).limit(3);
      const lines = (tk ?? []).map((t: any) => `• ${t.code} — ${lang === "ar" && t.events?.title_ar ? t.events.title_ar : t.events?.title ?? ""}${t.events?.starts_at ? ` · ${when(t.events.starts_at, lang)}` : ""}`).join("\n");
      reply = tk?.length ? (ar ? `تذاكرك:\n${lines}\nافتحها من المحفظة: ${wallet}` : `Your tickets:\n${lines}\nOpen them in your wallet: ${wallet}`) : (ar ? `ما في تذاكر فعّالة عالرقم. المحفظة: ${wallet}` : `No active tickets on this number. Your wallet: ${wallet}`);
    } else reply = ar ? `سجّل دخول بهالرقم وبتلاقي تذاكرك بالمحفظة: ${wallet}` : `Sign in with this number and your tickets are in your wallet: ${wallet}`;
  } else if (/refund|cancel|استرج|إلغاء|الغاء/i.test(q)) {
    reply = ar ? `الاسترجاع من المحفظة → التذكرة → «طلب استرجاع». المنظّم بيرد خلال ٤٨ ساعة: ${wallet}` : `Refunds are requested from your wallet → the ticket → "Request a refund". The organiser answers within 48 hours: ${wallet}`;
  } else if (/^(hi|hello|hey|salut|bonjour|مرحبا|هاي|كيفك|صباح|مسا)/i.test(q) && q.length < 25) {
    reply = ar ? `أهلاً${prof?.name ? ` ${prof.name.split(" ")[0]}` : ""} 😎 أنا مساعد ${tenant.name}. اسألني شو في الليلة، بالبترون، تحت ٣٠$، أو قلّي «تذكرتين للرووفتوب».` : `Hey${prof?.name ? ` ${prof.name.split(" ")[0]}` : ""} 😎 I'm the ${tenant.name} concierge. Ask me what's on tonight, in Batroun, under $30 — or say "2 tickets for the rooftop".`;
  } else if (cart && /^(yes|yeah|ok|okay|sure|go|book it|اي|ايه|أيوه|تمام|اوك|ماشي|يلا)\W*$/i.test(q)) {
    // a bare "yes" after a proposal: repeat the checkout link
    const l = L.find((x) => x.slug === cart.slug);
    const link = `${APP_URL}/e/${cart.slug}?tier=${cart.tier_id}&qty=${cart.qty}${cart.entry ? `&entry=${cart.entry.id}` : ""}&via=wa`;
    reply = ar ? `يلا 🎟️ ${cart.qty} × ${cart.name}${l ? ` — ${title(l, lang)}` : ""}. ادفع من هون:\n${link}` : `Let's go 🎟️ ${cart.qty} × ${cart.name}${l ? ` — ${title(l, lang)}` : ""}. Pay here:\n${link}`;
  } else {
    // catalogue answer — Claude phrases it and may propose a booking (BOOK: title | tier | qty); rules otherwise.
    // a new question drops any earlier proposal; the person gets a fresh one when they ask to book
    cart = null;
    const kb = L.map((l) => `${l.title} [${l.kind}, ${l.category}, ${l.venues?.city ?? ""}] (${l.kind === "event" ? when(l.starts_at, "en") : "open daily"}; offers: ${l.tiers.map((t) => `${t.kind} ${t.name} ${Number(t.face_price) ? `$${allIn(t.kind, Number(t.face_price))}` : "free"}${left(t) ? "" : " SOLD OUT"}`).join(", ")})`).join("; ");
    const system = `You are the ${tenant.name} concierge on WhatsApp. Warm, short (max 60 words), ${ar ? "Lebanese Arabic dialect" : "English"}. Only recommend listings from this catalogue, never invent: ${kb}. Name at most two. If the person clearly wants to book, end with a line "BOOK: <exact title> | <tier name> | <qty>". Otherwise end with "OPEN: <exact title>" for the best match. No links, no prices other than the catalogue's.`;
    const convo = history.map((h) => `${h.who === "user" ? "User" : "Concierge"}: ${h.text}`).join("\n");
    let ai = await claude(system, convo ? `${convo}\nUser: ${q}` : q);
    let picks: L[] = [];
    const resolve = (t: string) => L.find((l) => l.title.toLowerCase() === t.trim().toLowerCase()) ?? L.find((l) => l.title.toLowerCase().includes(t.trim().toLowerCase().slice(0, 12)));
    if (ai) {
      const bm = ai.match(/BOOK:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*$/m);
      if (bm) { const l = resolve(bm[1]); const t = l?.tiers.find((x) => x.name.toLowerCase() === bm[2].trim().toLowerCase() && left(x) > 0) ?? l?.tiers.filter((x) => x.kind !== "pass" && left(x) > 0 && isEntry(x)).sort((a, b) => a.sort - b.sort)[0]; if (l && t) { const e = entryFor(l, t); cart = { slug: l.slug, tier_id: t.id, name: t.name, qty: Math.min(Number(bm[3]) || 1, t.per_order_limit || 6), kind: t.kind, entry: e ? { id: e.id, name: e.name, kind: e.kind, face_price: e.face_price } : null }; picks = [l]; } ai = ai.replace(/\n?BOOK:.*$/m, "").trim(); }
      const om = ai.match(/OPEN:\s*(.+)$/m);
      if (om) { const l = resolve(om[1]); if (l) picks = [l]; ai = ai.replace(/\n?OPEN:.*$/m, "").trim(); }
      reply = ai;
    } else {
      picks = pickFor(q, L).slice(0, 2);
      reply = picks.length ? (ar ? "عندي:" : "Here's what fits:") : (ar ? "ما لقيت شي مناسب هلق. جرّب: طاولة، بحر، إقامة، أو سهرة." : "Nothing matches that yet. Try: a table, the beach, a stay, or a night out.");
    }
    const n = qtyIn(q);
    if (!cart && picks[0] && (n || /book|reserve|احجز|بدي|get me|take/i.test(q))) {
      const t = picks[0].tiers.filter((x) => x.kind !== "pass" && left(x) > 0 && isEntry(x)).sort((a, b) => a.sort - b.sort)[0];
      if (t) { cart = { slug: picks[0].slug, tier_id: t.id, name: t.name, qty: Math.min(n || 1, t.per_order_limit || 6), kind: t.kind, entry: null }; picks = [picks[0]]; }
    }
    if (picks.length) reply += "\n" + picks.map((l) => line(l, lang)).join("\n\n");
    if (cart) {
      const l = L.find((x) => x.slug === cart.slug);
      const t = l?.tiers.find((x) => x.id === cart.tier_id);
      // a service comes with its entrance: "Kayak needs a day pass — 1 × Sunbed day pass + 1 × Kayak = $36.75 all-in"
      const e: Tier | null = cart.entry ? (l?.tiers.find((x) => x.id === cart.entry.id) ?? null) : null;
      const total = t ? round2(allIn(t.kind, Number(t.face_price)) * cart.qty + (e ? allIn(e.kind, Number(e.face_price)) * cart.qty : 0)) : 0;
      const link = `${APP_URL}/e/${cart.slug}?tier=${cart.tier_id}&qty=${cart.qty}${e ? `&entry=${e.id}` : ""}&via=wa`;
      if (e) reply += "\n\n" + (ar ? `${cart.name} بدها دخول — بضيفلك ${cart.qty} × ${e.name_ar ?? e.name}.` : `${cart.name} needs an entry — adding ${cart.qty} × ${e.name}.`);
      reply += "\n\n" + (ar ? `${cart.qty} × ${cart.name}${total ? ` = ${money(total)} شامل الرسوم` : ""}. ادفع من هون (بطاقة، Whish، OMT أو كاش عالباب):\n${link}` : `${cart.qty} × ${cart.name}${total ? ` = ${money(total)} all-in` : ""}. Pay here (card, Whish, OMT or cash at the door):\n${link}`);
    }
  }

  const now = new Date().toISOString();
  const hist = [...history, { who: "user", text: q, at: now }, ...(reply ? [{ who: "bot", text: reply.slice(0, 600), at: now }] : [])].slice(-8);
  await db.from("wa_conversations").upsert({ phone, tenant_id: tenant.id, user_id: prof?.id ?? null, lang, history: hist, cart, handoff, messages: (conv0?.messages ?? 0) + 1, last_in_at: now, last_out_at: reply ? now : conv0?.last_out_at ?? null, updated_at: now });
  await db.from("message_log").insert({ tenant_id: tenant.id, user_id: prof?.id ?? null, channel: "whatsapp_in", template: "inbound", payload: { from: phone, text: q, handoff }, status: "received" });
  if (reply) await sendText(db, tenant.id, prof?.id ?? null, phone, reply);
  return { reply, cart, handoff };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  const url = new URL(req.url);
  if (req.method === "GET") {
    // Meta verification handshake
    if (url.searchParams.get("hub.mode") === "subscribe" && VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    return json({ ok: true, service: "wa-inbound", mode: WA_TOKEN ? "live" : "sandbox", ai: !!ANTHROPIC_KEY });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const raw = await req.text();
  const b = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!b) return json({ error: "bad_request" }, 400);
  const db = admin();
  const { data: tenant } = await db.from("tenants").select("id,slug,name").eq("slug", TENANT).single();
  if (!tenant) return json({ error: "tenant" }, 500);

  // simulated message (back office / tests)
  if (b.test) {
    const auth = req.headers.get("authorization") ?? "";
    let ok = (!!NOTIFY_SECRET && req.headers.get("x-notify-secret") === NOTIFY_SECRET) || auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    if (!ok && auth.startsWith("Bearer ")) {
      const { data: { user } } = await asUser(req).auth.getUser();
      if (user) { const { data: m } = await db.from("memberships").select("role").eq("user_id", user.id).in("role", ["super_admin", "country_admin"]).limit(1); ok = !!m?.length; }
    }
    if (!ok) return json({ error: "forbidden" }, 403);
    const phone = String(b.from ?? "").replace(/\D/g, "");
    if (!phone || !b.text) return json({ error: "bad_request" }, 400);
    const r = await handleMessage(db, tenant, phone, String(b.text), b.lang);
    return json({ ok: true, ...r });
  }

  // Meta payload — live mode refuses unsigned payloads (set WHATSAPP_APP_SECRET with the token); sandbox accepts them
  if (WA_TOKEN && !APP_SECRET) return json({ error: "app_secret_required" }, 403);
  if (!(await verifySignature(req, raw))) return json({ error: "signature" }, 403);
  const out: any[] = [];
  for (const entry of b.entry ?? []) for (const ch of entry.changes ?? []) for (const m of ch.value?.messages ?? []) {
    const phone = String(m.from ?? "").replace(/\D/g, "");
    const text = m.type === "text" ? m.text?.body : m.type === "interactive" ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title) : m.type === "button" ? m.button?.text : null;
    if (!phone || !text) continue;
    try { out.push({ phone, ...(await handleMessage(db, tenant, phone, String(text))) }); } catch (e) { out.push({ phone, error: String(e) }); }
  }
  return json({ ok: true, handled: out.length });
});
