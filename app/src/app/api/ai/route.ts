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
    const system = `You are the What's Up Lebanon concierge. Warm, short, Lebanese. Reply in the user's language (Lebanese Arabic dialect or English). The user is in ${city}. MANDATORY: only recommend listings from this catalogue, never invent: ${kb(L, lang)}. Prices are all-in. You can book tables, day passes, stays, tickets and passes. Max 60 words. End with a line "OPEN: <exact listing title in English>" for the one you recommend most.`;
    let text = await claude(system, q);
    let open: Listing | undefined;
    if (text) {
      const m = text.match(/OPEN:\s*(.+)$/m);
      if (m) { open = resolve(m[1]); text = text.replace(/\n?OPEN:.*$/m, "").trim(); }
    } else {
      const picks = pickFor(q, L).slice(0, 2);
      open = picks[0];
      text = picks.length
        ? lang === "ar" ? `عندي: ${picks.map((l) => line(l, lang)).join(" — و ")}. بدك احجزلك؟` : `Here's what fits: ${picks.map((l) => line(l, lang)).join(" — and ")}. Want me to hold it?`
        : lang === "ar" ? "ما لقيت شي مناسب هلق. جرّب: طاولة، بحر، إقامة، أو سهرة." : "Nothing matches that yet. Try: a table, the beach, a stay, or a night out.";
    }
    return NextResponse.json({ text, open: open ? { slug: open.slug, title: lang === "ar" && open.title_ar ? open.title_ar : open.title } : null, ai: !!process.env.ANTHROPIC_API_KEY });
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
