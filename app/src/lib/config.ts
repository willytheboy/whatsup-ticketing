// Runtime configuration. Every value has a safe default so the app builds and runs
// without environment variables (the anon key is public by design; RLS protects the data).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xhwmgnhspyaqsgggvujo.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhod21nbmhzcHlhcXNnZ2d2dWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTM0OTgsImV4cCI6MjEwNDg4OTQ5OH0.x54qWu8zFvpcMTaTH-6ai8lN--1RVKhsFGbmErOI-bY";
export const TENANT = process.env.NEXT_PUBLIC_TENANT ?? "lb";
export const APP_ROLE = process.env.NEXT_PUBLIC_APP_ROLE ?? "ticketing";
export const BACKOFFICE_URL = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "https://whatsup-backoffice-app.vercel.app";
export const IG_HANDLE = "whatsuplebanon";
/** The platform's WhatsApp number for the concierge hand-off and support (digits only, international). */
export const SUPPORT_WA = process.env.NEXT_PUBLIC_SUPPORT_WA ?? "96170000000";
export const SHORT_HOST = "wul.app";

/** Tenant time zone used for every date/time shown to buyers and staff. */
export const TZ = "Asia/Beirut";

/* ------------------------------------------------------------------ fee engine (brief §4.3)
   Buyer fee by offer type, shown all-in. The create-order edge function applies the same table. */
export type OfferKind = "ticket" | "daypass" | "item" | "stay" | "pass" | "table" | "deal";
export const FEE_PCT = 0.05;
export const FEE_FIXED = 0.5;
export const ORGANISER_FEE_PCT = 0.03;
export const PROCESSING_PCT = 0.025;
export const FX_RATE = 89500; // LBP per USD (display only)
export const FEES: Record<OfferKind, { pct: number; fixed: number }> = {
  ticket: { pct: 0.05, fixed: 0.5 },
  daypass: { pct: 0.05, fixed: 0 },
  item: { pct: 0.05, fixed: 0 },
  stay: { pct: 0.04, fixed: 0 },
  pass: { pct: 0, fixed: 0 },
  table: { pct: 0, fixed: 0 },
  deal: { pct: 0, fixed: 0 },
};
export const r2 = (n: number) => Math.round(n * 100) / 100;
/** Buyer fee for one unit of a given kind. Free things carry no fee. */
export const unitFee = (kind: OfferKind, face: number) => (face <= 0 ? 0 : r2(face * FEES[kind].pct + FEES[kind].fixed));
/** Buyer price for one unit, all-in. */
export const allInKind = (kind: OfferKind, face: number) => r2(face + unitFee(kind, face));
/** Buyer price for one ticket, all-in (legacy helper). */
export const allIn = (face: number) => allInKind("ticket", face);
/** What the organiser keeps per unit after the organiser fee (waived on free) and card processing. */
export const organiserNet = (face: number, orgPct = ORGANISER_FEE_PCT) => (face <= 0 ? 0 : r2(face * (1 - orgPct - PROCESSING_PCT)));
export const money = (usd: number) => (usd === 0 ? "Free" : "$" + usd.toFixed(2).replace(/\.00$/, ""));
export const lbp = (usd: number) => "LBP " + (Math.round((FX_RATE * usd) / 1000) * 1000).toLocaleString("en-US");
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
/** Signed money for ledgers: −$12.50 */
export const signed = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return (v < 0 ? "−" : "") + "$" + Math.abs(v).toFixed(2);
};

/* ------------------------------------------------------------------ catalogue (brief §4.2)
   Home rail. Legacy event categories map onto the rail so nothing already published disappears. */
export const RAIL: [string, string][] = [
  ["all", "tonight"], ["Dining", "dining"], ["Beach", "beach"], ["Stay", "stay"], ["Events", "events"],
  ["Music", "music"], ["Theatre", "theatre"], ["Sport", "sport"], ["Deals", "deals"], ["Passes", "passes"],
];
export const CATEGORY_ALIASES: Record<string, string[]> = {
  Dining: ["Dining", "Food"],
  Beach: ["Beach"],
  Stay: ["Stay"],
  Events: ["Events", "Festival", "Outdoors", "Art", "Community"],
  Music: ["Music"],
  Theatre: ["Theatre", "Comedy"],
  Sport: ["Sport", "Sports"],
};
export const LISTING_CATEGORIES = ["Events", "Music", "Dining", "Beach", "Stay", "Theatre", "Sport"];
export const railKey = (category: string) => Object.keys(CATEGORY_ALIASES).find((k) => CATEGORY_ALIASES[k].includes(category)) ?? "Events";

/* ------------------------------------------------------------------ upgrade ladder (monetisation model)
   Organiser plans. Fees live on the tenant; the plan changes the organiser fee and unlocks tools. */
export type PlanId = "free" | "pro" | "venue";
export const PLANS: { id: PlanId; price: number | null; orgPct: number; features: string[] }[] = [
  { id: "free", price: 0, orgPct: 0.03, features: ["planF1", "planF2", "planF3", "planF4"] },
  { id: "pro", price: 49, orgPct: 0.025, features: ["planP1", "planP2", "planP3", "planP4", "planP5"] },
  { id: "venue", price: null, orgPct: 0.02, features: ["planV1", "planV2", "planV3", "planV4", "planV5"] },
];
export const planOf = (id: string | null | undefined) => PLANS.find((p) => p.id === id) ?? PLANS[0];
/** Which plan a venue tool needs. */
export const REQUIRES: Record<string, PlanId> = { promoters: "pro", broadcast: "pro", insights: "pro", station: "venue", passes: "venue", rules: "venue" };
export const planRank: Record<PlanId, number> = { free: 0, pro: 1, venue: 2 };
export const hasPlan = (plan: string | null | undefined, need: PlanId) => planRank[planOf(plan).id] >= planRank[need];

/** Promote packages: media revenue. Paid into promotion_orders → ledger (rev:promotions). */
export const PACKAGES: { id: string; price: number; days: number; featured: boolean; lines: string[] }[] = [
  { id: "boost", price: 40, days: 7, featured: true, lines: ["pkB1", "pkB2", "pkB3"] },
  { id: "story", price: 120, days: 7, featured: true, lines: ["pkS1", "pkS2", "pkS3", "pkS4"] },
  { id: "takeover", price: 300, days: 14, featured: true, lines: ["pkT1", "pkT2", "pkT3", "pkT4", "pkT5"] },
];

/** Placeholder art when a listing has no photo: flat colour from the brand palette, deterministic by id. */
export const PALETTE = ["#639922", "#3B6D11", "#97C459", "#7A7975", "#B7B5AC", "#5F5E5A"];
export function tone(id: string) {
  let h = 0;
  for (const ch of id) h = (31 * h + ch.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}
