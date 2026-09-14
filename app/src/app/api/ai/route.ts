import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabase-server";
import { TENANT, allInKind } from "@/lib/config";
import { LIST_SELECT, lowest, type Listing } from "@/lib/catalogue";

export const dynamic = "force-dynamic";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/* The AI layer (Track B). One server route, three modes: concierge, vibe, extract. With ANTHROPIC_API_KEY set on Vercel it calls
   Claude with the live catalogue as the only source of truth; without it, it answers from the catalogue with plain rules, so the
   screens always work. Never invents listings: the model must end with OPEN: <exact title>, resolved here to a slug. */

async function catalogue(): Promise<Listing[]> {
  const db = sbServer();
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", TENANT).maybeSingle();
  let q = db.from("events").select(`${LIST_SELECT},description`).in("status", ["live", "sold_out"]).or(`kind.neq.event,starts_at.gte.${new Date(Date.now() - 864e5).toISOString()}`).order("starts_at");
  if (tenant) q = q.eq("tenant_id", tenant.id);
  const { data } = await q;
  return (data ?? []) as unknown as Listing[];
}
const kb = (L: Listing[], lang: string) =>
  L.map((l) => `${l.title} [${l.kind}, ${l.category}, ${l.venues?.city ?? ""}] (${l.kind === "event" ? new Date(l.starts_at).toDateString() : "open daily"}; ${l.venues?.name ?? ""}; offers: ${[
    ...l.tiers.map((x) => `${x.kind} ${x.name}${Number(x.face_price) ? ` $${allInKind(x.kind, Number(x.face_price))}` : " free"}`),
    ...(l.tables_vip ?? []).filter((x) => !x.reserved_by_order).map((x) => `table ${x.name} (${x.seats})`),
    ...(l.deals ?? []).map((d) => `deal ${d.name}`),
  ].join(", ")})`).join("; ");

async function claude(system: string, content: any, max = 600): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: max, system, messages: [{ role: "user", content }] }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.content ?? []).map((c: any) => c.text ?? "").join("").trim() || null;
  } catch { return null; }
}

const score = (l: Listing, words: string[]) => {
  const hay = [l.title, l.title_ar, l.category, l.kind, l.venues?.name, l.venues?.city, ...l.tiers.map((x) => `${x.kind} ${x.name}`), ...(l.deals ?? []).map((d) => d.name)].filter(Boolean).join(" ").toLowerCase();
  return words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0);
};
const INTENT: [RegExp, (l: Listing) => boolean][] = [
  [/table|dinner|restaurant|eat|عشا|طاولة|مطعم|أكل/i, (l) => l.kind === "venue" && (l.tables_vip ?? []).length > 0],
  [/beach|sunbed|swim|pool|بحر|سباحة|مسبح/i, (l) => l.category === "Beach" || l.tiers.some((x) => x.kind === "daypass")],
  [/stay|night|hotel|guest|sleep|mountain|إقامة|غرفة|جبل|فندق/i, (l) => l.kind === "stay"],
  [/pass|member|اشتراك|عضوية/i, (l) => l.kind === "pass"],
  [/free|ببلاش|مجان/i, (l) => l.tiers.some((x) => Number(x.face_price) === 0)],
  [/music|dj|party|concert|dance|سهرة|حفلة|موسيقى|رقص/i, (l) => l.category === "Music"],
  [/comedy|theatre|show|مسرح|كوميديا/i, (l) => ["Comedy", "Theatre"].includes(l.category)],
  [/hike|run|sport|outdoor|مشي|رياضة/i, (l) => ["Outdoors", "Sport", "Sports"].includes(l.category)],
];
function pickFor(q: string, L: Listing[]): Listing[] {
  const words = q.toLowerCase().split(/[^\p{L}\p{N}$]+/u).filter((w) => w.length > 2);
  const intents = INTENT.filter(([re]) => re.test(q)).map(([, f]) => f);
  const ranked = L.map((l) => ({ l, s: score(l, words) * 2 + intents.reduce((a, f) => a + (f(l) ? 3 : 0), 0) + (l.kind === "event" ? 0.5 : 0) })).sort((a, b) => b.s - a.s);
  return (ranked[0]?.s ? ranked.filter((r) => r.s > 0) : ranked).map((r) => r.l);
}
const line = (l: Listing, lang: "en" | "ar") => {
  const title = lang === "ar" && l.title_ar ? l.title_ar : l.title;
  const venue = (lang === "ar" && l.venues?.name_ar) || l.venues?.name || "";
  const when = l.kind === "event" ? new Date(l.starts_at).toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Beirut" }) : "";
  return `${title}${when ? ` · ${when}` : ""} · ${venue} · ${lowest(l, lang)}`;
};

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const lang: "en" | "ar" = b.lang === "ar" ? "ar" : "en";
  const L = await catalogue();
  const resolve = (title: string) => L.find((l) => l.title.toLowerCase() === title.trim().toLowerCase() || l.title_ar === title.trim());

  if (b.mode === "concierge") {
    const q = String(b.q ?? "").slice(0, 500);
    const city = b.city || "Lebanon";
    const history = Array.isArray(b.history) ? b.history.slice(-6).map((h: any) => `${h.who === "me" ? "User" : "Concierge"}: ${String(h.text).slice(0, 300)}`).join("\n") : "";
    const system = `You are the What's Up Lebanon concierge. Warm, short, Lebanese. Reply in the user's language (Lebanese Arabic dialect or English). The user is in ${city}. MANDATORY: only recommend listings from this catalogue, never invent: ${kb(L, lang)}. Prices are all-in. You can book tables, day passes, stays, tickets and passes. Max 60 words. End with a line "OPEN: <exact listing title in English>" for the one you recommend most. If the user states a quantity or asks to book, add a final line "BOOK: <exact listing title> | <exact offer name> | <qty>".`;
    let text = await claude(system, history ? `${history}\nUser: ${q}` : q);
    let open: Listing | undefined;
    let cart: { slug: string; tier_id: string; name: string; qty: number; kind: string } | null = null;
    const qtyIn = (() => { const m = q.match(/(\d+)\s*(tickets?|people|persons?|pax|seats?|تذاكر|تذكرة|أشخاص|اشخاص)|for\s+(\d+)|لـ?\s?(\d+)/i); const n = Number(m?.[1] ?? m?.[3] ?? m?.[4]); return n > 0 && n <= 20 ? n : 0; })();
    if (text) {
      const bm = text.match(/BOOK:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*$/m);
      if (bm) {
        const l = resolve(bm[1]); const tier = l?.tiers.find((x) => x.name.toLowerCase() === bm[2].trim().toLowerCase()) ?? l?.tiers[0];
        if (l && tier) cart = { slug: l.slug, tier_id: tier.id, name: tier.name, qty: Math.min(Number(bm[3]) || 1, tier.per_order_limit || 6), kind: tier.kind };
        text = text.replace(/\n?BOOK:.*$/m, "").trim();
      }
      const m = text.match(/OPEN:\s*(.+)$/m);
      if (m) { open = resolve(m[1]); text = text.replace(/\n?OPEN:.*$/m, "").trim(); }
    } else {
      const picks = pickFor(q, L).slice(0, 2);
      open = picks[0];
      text = picks.length
        ? lang === "ar" ? `عندي: ${picks.map((l) => line(l, lang)).join(" — و ")}. بدك احجزلك؟` : `Here's what fits: ${picks.map((l) => line(l, lang)).join(" — and ")}. Want me to hold it?`
        : lang === "ar" ? "ما لقيت شي مناسب هلق. جرّب: طاولة، بحر، إقامة، أو سهرة." : "Nothing matches that yet. Try: a table, the beach, a stay, or a night out.";
    }
    if (!cart && open && qtyIn && /book|reserve|احجز|بدي|get|take/i.test(q)) {
      const tier = open.tiers.filter((x) => x.kind !== "pass").sort((a, b) => a.sort - b.sort)[0];
      if (tier) cart = { slug: open.slug, tier_id: tier.id, name: tier.name, qty: Math.min(qtyIn, tier.per_order_limit || 6), kind: tier.kind };
    }
    return NextResponse.json({ text, open: open ? { slug: open.slug, title: lang === "ar" && open.title_ar ? open.title_ar : open.title } : null, cart, ai: !!process.env.ANTHROPIC_API_KEY });
  }

  if (b.mode === "translate") {
    const to = b.to === "ar" ? "Lebanese Arabic" : "English";
    const text = await claude(`Translate the message into ${to}. Keep it short and natural. Return only the translation.`, String(b.text ?? "").slice(0, 600), 200);
    return NextResponse.json({ text, ai: !!text });
  }

  if (b.mode === "copilot") {
    // venue copilot: plain advice from the organiser's own numbers, Claude phrases it when available
    const facts = JSON.stringify(b.facts ?? {}).slice(0, 4000);
    const q = String(b.q ?? "").slice(0, 400);
    const system = `You are the WhatsUp venue copilot. Answer the organiser in ${lang === "ar" ? "Lebanese Arabic" : "English"}, max 90 words, concrete, numbers first, no fluff. Only use these facts about their venue (JSON): ${facts}. Suggest at most one action from: Boost ($40, 7 days on Home), open a tier, WhatsApp broadcast (Pro), card-only for late reservations, add a cover photo.`;
    let text = await claude(system, q || "What should I do this week?", 300);
    if (!text) {
      const f = b.facts ?? {}; const parts: string[] = [];
      if (f.sold != null) parts.push(lang === "ar" ? `بعت ${f.sold} هالأسبوع بإجمالي $${f.gross ?? 0}.` : `${f.sold} sold this week, $${f.gross ?? 0} gross.`);
      if (Array.isArray(f.slow) && f.slow.length) parts.push(lang === "ar" ? `${f.slow[0]} ماشي بطيء — الـ Boost بيحطه عالرئيسية ٧ أيام.` : `${f.slow[0]} is behind pace — a Boost puts it on Home for 7 days.`);
      if (f.waiting) parts.push(lang === "ar" ? `${f.waiting} ناطرين عاللائحة — افتح فئة.` : `${f.waiting} on the waitlist — open a tier.`);
      if (f.noShow) parts.push(lang === "ar" ? `${f.noShow}% ما إجوا عالكاش — جرّب بطاقة فقط للجاية.` : `${f.noShow}% cash no-shows — try card-only for the next one.`);
      text = parts.join(" ") || (lang === "ar" ? "كل شي ماشي. انشر إعلانك الجاي من بوستر." : "All steady. Publish your next listing from a poster.");
    }
    return NextResponse.json({ text, ai: !!process.env.ANTHROPIC_API_KEY });
  }

  if (b.mode === "ledger") {
    // back office "ask the ledger": free text → one of a few safe intents, answered from the ledger views
    const q = String(b.q ?? "").slice(0, 300);
    const INTENTS = ["revenue", "top_organisers", "cash_held", "payouts_due", "refunds", "promotions", "no_shows", "signups"] as const;
    type Intent = typeof INTENTS[number];
    let intent: Intent | null = null; let days = /month|شهر/i.test(q) ? 30 : /today|اليوم/i.test(q) ? 1 : 7;
    const ai = await claude(`Map the question to JSON {"intent": one of ${JSON.stringify(INTENTS)}, "days": number}. Only JSON.`, q, 60);
    if (ai) { try { const j = JSON.parse(ai.replace(/```json|```/g, "")); if (INTENTS.includes(j.intent)) { intent = j.intent; days = Number(j.days) || days; } } catch {} }
    if (!intent) intent = /organis|venue|top|أفضل|منظ/i.test(q) ? "top_organisers" : /cash|كاش/i.test(q) ? "cash_held" : /payout|settle|owe|دفع/i.test(q) ? "payouts_due" : /refund|استرجاع/i.test(q) ? "refunds" : /promo|boost|ترويج/i.test(q) ? "promotions" : /no.?show|ما إجو/i.test(q) ? "no_shows" : /sign|user|مستخدم/i.test(q) ? "signups" : "revenue";
    const db = sbServer(); const since = new Date(Date.now() - days * 864e5).toISOString();
    let answer = ""; let rows: any[] = [];
    if (intent === "revenue") { const { data } = await db.from("orders").select("face_total,buyer_fee,organiser_fee,processing_fee,total,payment_method").eq("status", "paid").gte("paid_at", since); rows = data ?? []; const s = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0); answer = `Last ${days}d: ${rows.length} paid orders · face $${s("face_total").toFixed(0)} · buyer fees $${s("buyer_fee").toFixed(0)} · organiser fees $${s("organiser_fee").toFixed(0)} · processing $${s("processing_fee").toFixed(0)} · platform take ≈ $${(s("buyer_fee") + s("organiser_fee") - s("processing_fee")).toFixed(0)}.`; }
    else if (intent === "top_organisers") { const { data } = await db.from("organiser_event_stats").select("organiser_id,title,gross,sold"); rows = data ?? []; const by: Record<string, number> = {}; for (const r of rows) by[r.organiser_id] = (by[r.organiser_id] ?? 0) + Number(r.gross); const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5); const { data: orgs } = await db.from("organisers").select("id,name").in("id", top.map((x) => x[0])); answer = "Top organisers by gross: " + top.map(([id, g], i) => `${i + 1}. ${orgs?.find((o) => o.id === id)?.name ?? id.slice(0, 6)} $${g.toFixed(0)}`).join(" · "); }
    else if (intent === "cash_held") { const { data } = await db.from("orders").select("total").eq("status", "paid").eq("payment_method", "cash_door").gte("paid_at", since); rows = data ?? []; answer = `Cash collected at doors in the last ${days}d: $${rows.reduce((a, r) => a + Number(r.total), 0).toFixed(0)} across ${rows.length} orders (organisers hold it; fees are netted in the weekly statement).`; }
    else if (intent === "payouts_due") { const { data } = await db.from("payouts").select("amount,status,organiser_id").eq("status", "scheduled"); rows = data ?? []; answer = `${rows.length} scheduled payouts totalling $${rows.reduce((a, r) => a + Number(r.amount), 0).toFixed(0)} — next run Monday 06:00.`; }
    else if (intent === "refunds") { const { data } = await db.from("orders").select("total,refund_status").not("refund_status", "is", null).gte("refund_requested_at", since); rows = data ?? []; const c = (k: string) => rows.filter((r) => r.refund_status === k); answer = `Refunds last ${days}d: ${c("requested").length} open · ${c("refunded").length} refunded ($${c("refunded").reduce((a, r) => a + Number(r.total), 0).toFixed(0)}) · ${c("declined").length} declined.`; }
    else if (intent === "promotions") { const { data } = await db.from("promotion_orders").select("package,price").eq("status", "paid").gte("created_at", since); rows = data ?? []; const by: Record<string, number> = {}; for (const r of rows) by[r.package] = (by[r.package] ?? 0) + 1; answer = `Promotions last ${days}d: ${rows.length} sold for $${rows.reduce((a, r) => a + Number(r.price), 0).toFixed(0)} (${Object.entries(by).map(([k, n]) => `${k} ×${n}`).join(", ") || "none"}).`; }
    else if (intent === "no_shows") { const { data } = await db.from("orders").select("status,payment_method").in("payment_method", ["cash_door", "omt"]).gte("created_at", since); rows = data ?? []; const exp = rows.filter((r) => r.status === "expired").length; answer = `Pay-later reservations last ${days}d: ${rows.length}, of which ${exp} expired unpaid (${rows.length ? Math.round((exp / rows.length) * 100) : 0}% no-show).`; }
    else { const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since); answer = `${count ?? 0} new accounts in the last ${days}d.`; }
    return NextResponse.json({ intent, days, text: answer, n: rows.length, ai: !!process.env.ANTHROPIC_API_KEY });
  }

  if (b.mode === "statement") {
    const p = b.partner ?? {};
    const text = (await claude(`Write a short, friendly WhatsApp message (max 90 words, ${lang === "ar" ? "Lebanese Arabic" : "English"}) from WhatsUp Lebanon to a venue partner summarising their weekly statement. Use only these figures: ${JSON.stringify(p).slice(0, 1500)}. End with "Statement PDF is in your Finance tab."`, "Draft it.", 300))
      ?? `Hi ${p.name ?? ""} 👋 Your WhatsUp statement for ${p.period ?? "this week"}: gross $${p.gross ?? 0}, fees $${p.fees ?? 0}, cash you hold $${p.cash ?? 0}, balance ${Number(p.balance ?? 0) >= 0 ? "we pay you" : "you pay"} $${Math.abs(Number(p.balance ?? 0))}. Statement PDF is in your Finance tab.`;
    return NextResponse.json({ text, ai: !!process.env.ANTHROPIC_API_KEY });
  }

  if (b.mode === "vibe") {
    const mood = `${String(b.mood ?? "").slice(0, 300)} ${(b.chips ?? []).join(", ")}`;
    const system = `Return ONLY JSON {"name":"2-3 word vibe name","line":"one sentence describing a 30s track","bpm":number 90-128,"plan":["3 listing titles in English in order: day, dinner, night"]} choosing plan titles only from: ${L.map((l) => l.title).join("; ")}. Name and line in ${lang === "ar" ? "Lebanese Arabic" : "English"}. No markdown.`;
    let v: any = null;
    const text = await claude(system, mood, 400);
    if (text) { try { v = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {} }
    if (!v) {
      const day = pickFor("beach", L)[0], dinner = pickFor("table dinner", L)[0], night = pickFor(`music party ${mood}`, L).find((l) => l.kind === "event") ?? L[0];
      const chips = (b.chips ?? []) as string[];
      v = {
        name: lang === "ar" ? (chips.includes("Mountains") ? "أرز وسكون" : "ملح وعود") : chips.includes("Mountains") ? "Cedar Hush" : chips.includes("Late") ? "Neon Manara" : "Salt and Oud",
        line: lang === "ar" ? "عود على إيقاع بطيء، والموج تحته." : chips.includes("Late") ? "Warehouse kick, a muted trumpet, and the sea at 4 am." : "Oud over a slow four-on-the-floor, waves under it.",
        bpm: chips.includes("Late") ? 124 : chips.includes("Chill") ? 96 : 110,
        plan: [day?.title, dinner?.title, night?.title].filter(Boolean),
      };
    }
    const plan = (v.plan ?? []).map((tt: string) => resolve(tt)).filter(Boolean).map((l: Listing) => ({ slug: l.slug, title: lang === "ar" && l.title_ar ? l.title_ar : l.title }));
    return NextResponse.json({ name: v.name, line: v.line, bpm: v.bpm ?? 110, plan, ai: !!process.env.ANTHROPIC_API_KEY });
  }

  if (b.mode === "extract") {
    const system = 'From an event poster image or an Instagram caption, return ONLY JSON {"name":string,"name_ar":string or null,"date":"YYYY-MM-DDTHH:MM" or null,"price":number or 0,"kind":"ticket"|"table"|"daypass"|"stay"|"item"|"pass","cap":number or 100,"venue":string or null,"city":string or null,"desc":string}. Lebanese context, prices in USD. No markdown.';
    const content = b.image ? [{ type: "image", source: { type: "base64", media_type: b.mime || "image/jpeg", data: b.image } }, { type: "text", text: "Extract the listing." }] : String(b.text ?? "").slice(0, 3000);
    let out: any = null;
    const text = await claude(system, content, 500);
    if (text) { try { out = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {} }
    if (!out) {
      const s = String(b.text ?? "");
      out = { name: (s.split(/[\n.!|]/)[0] || "").trim().slice(0, 60), name_ar: null, date: null, price: 0, kind: "ticket", cap: 100, venue: null, city: null, desc: s.slice(0, 200) };
      const p = s.match(/\$\s?(\d+)/); if (p) out.price = Number(p[1]);
      const m = s.match(/(\d{1,2})\s*(sep|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug)/i);
      if (m) { const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase()) + 1; const y = new Date().getFullYear() + (mo < new Date().getMonth() + 1 ? 1 : 0); out.date = `${y}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}T20:00`; }
      if (/table|dinner|brunch/i.test(s)) out.kind = "table";
      if (/day pass|sunbed|pool day|beach day/i.test(s)) out.kind = "daypass";
      if (/room|night|guest house|stay/i.test(s)) out.kind = "stay";
      const at = s.match(/(?:at|@)\s+([A-Z][\w' ]{2,40})/); if (at) out.venue = at[1].trim();
    }
    return NextResponse.json({ ...out, ai: !!process.env.ANTHROPIC_API_KEY });
  }
  return NextResponse.json({ error: "mode" }, { status: 400 });
}
