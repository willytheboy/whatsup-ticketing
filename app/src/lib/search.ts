import { TZ, allInKind } from "./config";
import { isAccess, left, type Listing } from "./catalogue";

/* Search words that are filters, not text (v0.9.1): days ("tonight", "tomorrow", "this weekend", "saturday", "السبت"),
   a price cap ("under $30", "تحت ٣٠$") and "free". Whatever is left must appear in the listing's text, as before. */

const DAY_MS = 864e5;
export const beirutDay = (d: Date | string | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const weekday = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }));

// 0 = Sunday … 6 = Saturday
const DAY_WORDS: Record<string, number> = {
  sunday: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
  "احد": 0, "أحد": 0, "حد": 0, "اثنين": 1, "إثنين": 1, "تنين": 1, "ثلاثاء": 2, "تلاتا": 2, "تلات": 2, "اربعاء": 3, "أربعاء": 3, "اربعا": 3, "خميس": 4, "جمعة": 5, "جمعه": 5, "سبت": 6,
};
const TODAY = ["today", "tonight", "اليوم", "الليلة", "الليله", "هلق"];
const TOMORROW = ["tomorrow", "بكرا", "بكرة", "بكره"];
const WEEKEND = ["weekend", "ويكند", "الويكند", "هالويكند"];
const FREE = ["free", "ببلاش", "مجاني", "مجانا", "مجاناً"];
const STOP = new Set(["this", "next", "on", "in", "at", "the", "a", "for", "و", "في", "ب"]);
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
/** Arabic day words come with or without the article ("السبت", "سبت", "هالسبت"). */
const bare = (w: string) => w.replace(/^(هال|بال|ال)(?=..)/, "");

export type Parsed = { words: string[]; days: Set<string> | null; maxPrice: number | null; free: boolean };

export function parseQuery(q: string, now = new Date()): Parsed {
  let text = toLatin(q.toLowerCase().trim());
  let maxPrice: number | null = null;
  const price = text.match(/(?:under|below|less than|max|<|تحت|أقل من|اقل من)\s*\$?\s*(\d+)\s*\$?/);
  if (price) { maxPrice = Number(price[1]); text = text.replace(price[0], " "); }
  const next7 = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * DAY_MS));
  const days = new Set<string>();
  let free = false;
  const words: string[] = [];
  for (const w of text.split(/[\s,،.;!?]+/).filter(Boolean)) {
    if (STOP.has(w)) continue;
    if (FREE.includes(w)) { free = true; continue; }
    if (TODAY.includes(w)) { days.add(beirutDay(now)); continue; }
    if (TOMORROW.includes(w)) { days.add(beirutDay(next7[1])); continue; }
    if (WEEKEND.includes(w) || WEEKEND.includes(bare(w))) {
      // Friday to Sunday: what is left of this weekend (Friday or Saturday), or the next one; on a Sunday, today and the coming weekend
      const wd = weekday(now);
      const span = wd === 0 ? [0, 5, 6, 7] : wd >= 5 ? Array.from({ length: 7 - wd + 1 }, (_, i) => i) : [5 - wd, 6 - wd, 7 - wd];
      for (const i of span) days.add(beirutDay(new Date(now.getTime() + i * DAY_MS)));
      continue;
    }
    const d = DAY_WORDS[w] ?? DAY_WORDS[bare(w)];
    if (d !== undefined) {
      // the next such day; said on that very day it also means the same day next week ("sunday" on a Sunday)
      const i = next7.findIndex((x) => weekday(x) === d);
      if (i >= 0) { days.add(beirutDay(next7[i])); if (i === 0) days.add(beirutDay(now.getTime() + 7 * DAY_MS)); }
      continue;
    }
    words.push(w);
  }
  return { words, days: days.size ? days : null, maxPrice, free };
}

/** Cheapest all-in entry price a buyer can still get; null when the listing only takes table bookings. */
export function lowestPrice(l: Listing): number | null {
  const entries = l.tiers.filter(isAccess);
  const open = (entries.length ? entries : l.tiers).filter((x) => left(x) > 0 || x.kind === "pass");
  if (!open.length) return null;
  return Math.min(...open.map((x) => allInKind(x.kind, Number(x.face_price))));
}

const hay = (l: Listing) =>
  [l.title, l.title_ar, l.category, l.kind, l.venues?.name, l.venues?.name_ar, l.venues?.city, l.venues?.city_ar, ...l.tiers.map((x) => `${x.name} ${x.name_ar ?? ""} ${x.kind}`), ...(l.deals ?? []).map((d) => d.name)]
    .filter(Boolean).join(" ").toLowerCase();

export function matches(l: Listing, p: Parsed): boolean {
  // days: an event on one of the days; venues and stays are open, a season pass is not a "tonight" answer
  if (p.days && (l.kind === "pass" || (l.kind === "event" && !p.days.has(beirutDay(l.starts_at))))) return false;
  if (p.free && !l.tiers.some((x) => isAccess(x) && Number(x.face_price) === 0)) return false;
  if (p.maxPrice !== null) { const lp = lowestPrice(l); if (lp === null || lp > p.maxPrice) return false; }
  if (!p.words.length) return true;
  const h = hay(l);
  return p.words.every((w) => h.includes(w));
}

/** Results: events by date first, then venues, stays and passes. */
export const searchOrder = (a: Listing, b: Listing) => (a.kind === "event" ? 0 : 1) - (b.kind === "event" ? 0 : 1) || a.starts_at.localeCompare(b.starts_at);
