import { allInKind, money, railKey, type OfferKind, CATEGORY_ALIASES } from "./config";
import { t, type Lang } from "./i18n";

/* One object, seven offers (brief §4.3): a Listing (events row) sells tiers of a kind, VIP tables and deals. */
export type Tier = {
  id: string; name: string; name_ar: string | null; face_price: number; capacity: number; sold: number; held: number;
  kind: OfferKind; member_free: boolean; plan_months: number | null; per_order_limit: number; note: string | null; sort: number;
};
export type Table = { id: string; name: string; name_ar: string | null; seats: number; min_spend: number; deposit: number; reserved_by_order: string | null; packages?: { id: string; name: string; name_ar?: string; price: number; desc?: string }[] };
export type Deal = { id: string; name: string; name_ar?: string; member_only?: boolean };
export type Venue = { id?: string; name: string; name_ar: string | null; city: string; city_ar: string | null; address?: string | null; address_ar?: string | null; lat?: number | null; lng?: number | null };
export type Listing = {
  id: string; slug: string; title: string; title_ar: string | null; description?: string | null; description_ar?: string | null;
  category: string; kind: "event" | "venue" | "stay" | "pass"; starts_at: string; ends_at?: string | null; doors_at?: string | null; status: string;
  featured_until: string | null; cover_url: string | null; deals: Deal[]; pinned?: string | null; pinned_ar?: string | null;
  venues: Venue | null; organisers?: { id: string; name: string; name_ar: string | null; plan?: string } | null;
  tiers: Tier[]; tables_vip?: Table[];
};

export const LIST_SELECT =
  "id,slug,title,title_ar,category,kind,starts_at,ends_at,doors_at,status,featured_until,cover_url,deals,pinned,pinned_ar,venues(id,name,name_ar,city,city_ar,address,address_ar,lat,lng),tiers(id,name,name_ar,face_price,capacity,sold,held,kind,member_free,plan_months,per_order_limit,note,sort),tables_vip(id,name,name_ar,seats,min_spend,deposit,reserved_by_order,packages)";

export const isFeatured = (l: Listing, now = new Date()) => !!l.featured_until && new Date(l.featured_until) > now;
export const left = (x: Tier) => Math.max(0, x.capacity - x.sold - x.held);
export const openTables = (l: Listing) => (l.tables_vip ?? []).filter((x) => !x.reserved_by_order);

/** The offer type shown on the card badge: the first sellable thing. */
export function badgeKind(l: Listing): OfferKind {
  if (l.kind === "pass") return "pass";
  const tiers = [...l.tiers].sort((a, b) => a.sort - b.sort);
  if (l.kind === "venue" && openTables(l).length && !tiers.some((x) => x.kind === "daypass")) return "table";
  return tiers[0]?.kind ?? (openTables(l).length ? "table" : l.deals?.length ? "deal" : "ticket");
}

/** Lowest all-in price line for a card: "From $26", "$89 / month", "$95 / night", "Free", "Book". */
export function lowest(l: Listing, lang: Lang): string {
  const primary = badgeKind(l);
  const avail = l.tiers.filter((x) => left(x) > 0 || x.kind === "pass");
  if (primary === "table") return t(lang, "book");
  const tiers = avail.some((x) => x.kind === primary) ? avail.filter((x) => x.kind === primary) : avail;
  if (!tiers.length) {
    if (openTables(l).length) return t(lang, "book");
    return l.tiers.length ? t(lang, "soldOut") : t(lang, "free");
  }
  const priced = tiers.map((x) => ({ x, p: allInKind(x.kind, Number(x.face_price)) }));
  const m = priced.reduce((a, b) => (b.p < a.p ? b : a));
  if (m.p === 0) return m.x.kind === "stay" ? t(lang, "book") : t(lang, "free");
  if (m.x.kind === "pass") return `${money(m.p)} ${t(lang, "perMonth")}`;
  if (m.x.kind === "stay") return `${money(m.p)} ${t(lang, "perNight")}`;
  return `${t(lang, "from")} ${money(m.p)}`;
}

/** Live venue meter: share of capacity sold across tickets / day passes (brief §5.3). Null when nothing to measure. */
export function fill(l: Listing): number | null {
  const o = l.tiers.filter((x) => ["ticket", "daypass"].includes(x.kind) && x.capacity > 0 && x.capacity < 5000);
  if (!o.length) return null;
  const cap = o.reduce((a, x) => a + x.capacity, 0);
  const sold = o.reduce((a, x) => a + x.sold + x.held, 0);
  return Math.min(100, Math.round((sold / cap) * 100));
}
export const meterTone = (p: number) => (p > 85 ? "var(--red)" : p > 55 ? "var(--amber)" : "var(--g2)");
export const meterWord = (p: number, lang: Lang) => t(lang, p > 85 ? "packed" : p > 55 ? "busy" : "quiet");

/** Rail filter (brief §4.2): Deals and Passes are cross-cuts. */
export function inRail(l: Listing, key: string): boolean {
  if (key === "all") return true;
  if (key === "Deals") return (l.deals ?? []).length > 0;
  if (key === "Passes") return l.kind === "pass" || l.tiers.some((x) => x.kind === "pass");
  if (key === "Stay") return l.kind === "stay" || l.tiers.some((x) => x.kind === "stay");
  return (CATEGORY_ALIASES[key] ?? [key]).includes(l.category) || railKey(l.category) === key;
}

export const kindLabel = (k: OfferKind, lang: Lang) => t(lang, k);
export const priceLabel = money;
