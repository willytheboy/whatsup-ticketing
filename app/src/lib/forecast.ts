import { t, type Lang } from "./i18n";

/* Intelligence for venues (brief §5.13 / spec §intelligence): a plain sales-pace forecast and the nudges built on it.
   Everything here is explainable arithmetic, not a model: pace = sold ÷ days on sale, projected = sold + pace × days left. */

type EvLite = { id: string; title: string; title_ar?: string | null; kind: string; status: string; starts_at: string; created_at?: string; cover_url?: string | null; featured_until?: string | null };
type TierLite = { id: string; event_id: string; capacity: number; sold: number; held: number; kind: string; name: string };

export type Forecast = { pct: number; projected: number; capacity: number; pace: number; soldOutBy: string | null; daysLeft: number };

export function forecast(e: EvLite, tiers: TierLite[]): Forecast | null {
  const mine = tiers.filter((x) => x.event_id === e.id && x.kind !== "pass");
  if (!mine.length || e.kind === "pass") return null;
  const capacity = mine.reduce((a, x) => a + x.capacity, 0);
  const sold = mine.reduce((a, x) => a + x.sold + x.held, 0);
  if (!capacity) return null;
  const start = new Date(e.created_at ?? Date.now()).getTime();
  const onSale = Math.max(1, (Date.now() - start) / 864e5);
  const daysLeft = Math.max(0, (new Date(e.starts_at).getTime() - Date.now()) / 864e5);
  const pace = sold / onSale;
  const projected = Math.min(capacity, Math.round(sold + pace * daysLeft));
  const pct = Math.round((projected / capacity) * 100);
  const remaining = capacity - sold;
  const soldOutBy = pace > 0 && remaining / pace <= daysLeft ? new Date(Date.now() + (remaining / pace) * 864e5).toISOString() : null;
  return { pct, projected, capacity, pace: Math.round(pace * 10) / 10, soldOutBy, daysLeft: Math.round(daysLeft) };
}

export type Nudge = { title: string; body: string; cta: string; href: string; tone: "green" | "amber" | "red" };

export function nudgesFor(a: { events: EvLite[]; tiers: TierLite[]; stats: { event_id: string; sold: number; capacity: number; checked_in: number }[]; refunds: number; waits: Record<string, number>; plan: string; whatsapp: string | null; lang: Lang }): Nudge[] {
  const L = (k: string) => t(a.lang, k);
  const out: Nudge[] = [];
  const name = (e: EvLite) => (a.lang === "ar" && e.title_ar ? e.title_ar : e.title);
  if (a.refunds) out.push({ title: `${a.refunds} ${L("nRefundsT")}`, body: L("nRefundsB"), cta: L("open"), href: "/org/refunds", tone: "amber" });
  for (const e of a.events.filter((x) => x.status === "live")) {
    const fc = forecast(e, a.tiers);
    const days = (new Date(e.starts_at).getTime() - Date.now()) / 864e5;
    const mine = a.tiers.filter((x) => x.event_id === e.id);
    const waiting = mine.reduce((s, x) => s + (a.waits[x.id] ?? 0), 0);
    const featured = e.featured_until && new Date(e.featured_until) > new Date();
    if (waiting >= 3) out.push({ title: `${waiting} ${L("nWaitT")} · ${name(e)}`, body: L("nWaitB"), cta: L("reopenTier"), href: `/org/e/${e.id}`, tone: "green" });
    if (e.kind === "event" && fc && days > 0 && days <= 10 && fc.pct < 40 && !featured) out.push({ title: `${name(e)} · ${fc.pct}% ${L("forecast")}`, body: L("nSlowB"), cta: L("promote"), href: `/org/promote/${e.id}`, tone: "amber" });
    if (e.kind === "event" && fc && fc.soldOutBy && days > 2) out.push({ title: `${name(e)} · ${L("nHotT")}`, body: L("nHotB"), cta: L("manage"), href: `/org/e/${e.id}`, tone: "green" });
    if (!e.cover_url) out.push({ title: `${name(e)} · ${L("nCoverT")}`, body: L("nCoverB"), cta: L("addCover"), href: `/org/e/${e.id}`, tone: "amber" });
    if (e.kind === "event" && days < 0 && days > -2) {
      const st = a.stats.find((s) => s.event_id === e.id);
      if (st && st.sold && st.checked_in / st.sold < 0.5) out.push({ title: `${name(e)} · ${Math.round((1 - st.checked_in / st.sold) * 100)}% ${L("noShow")}`, body: L("nNoShowB"), cta: L("open"), href: `/org/insights`, tone: "red" });
    }
  }
  if (!a.whatsapp) out.push({ title: L("nWaT"), body: L("nWaB"), cta: L("add"), href: "/org#whatsapp", tone: "amber" });
  if (a.plan === "free" && a.events.length >= 2) out.push({ title: L("nProT"), body: L("nProB"), cta: L("upgradePro"), href: "/org/plan", tone: "green" });
  return out;
}

/* ---- pricing assistant (v0.7): per-tier pace from tier_pace() and a plain suggestion ---------------------------------
   slow  = projected sell-through under 60 % with more than two days to go → one-tap flash code (15 % for 48 h; 25 % when under 40 %)
   hot   = on course to sell out with more than three days left → the next tier can carry a higher price (+10 %)
   track = everything else. Nothing here changes a price by itself; the organiser taps. */
export type TierPace = { tier_id: string; name: string; face_price: number; capacity: number; sold: number; held: number; sold_7d: number; sold_1d: number; starts_at: string; listed_at: string };
export type TierAdvice = { pct: number; projected: number; daysLeft: number; pace: number; state: "slow" | "hot" | "track" | "soldout" | "past"; flash: { pct: number; hours: number } | null; raise: number | null };

export function tierAdvice(r: TierPace): TierAdvice {
  const cap = Number(r.capacity) || 0, sold = Number(r.sold) + Number(r.held);
  const daysLeft = Math.max(0, (new Date(r.starts_at).getTime() - Date.now()) / 864e5);
  const onSale = Math.max(1, (Date.now() - new Date(r.listed_at).getTime()) / 864e5);
  // recent pace counts more than lifetime pace: 7-day rate when we have it, else lifetime
  const pace = Number(r.sold_7d) > 0 ? Number(r.sold_7d) / Math.min(7, onSale) : sold / onSale;
  const projected = cap ? Math.min(cap, Math.round(sold + pace * daysLeft)) : 0;
  const pct = cap ? Math.round((projected / cap) * 100) : 0;
  const left = cap - sold;
  if (daysLeft <= 0) return { pct, projected, daysLeft: 0, pace, state: "past", flash: null, raise: null };
  if (left <= 0) return { pct: 100, projected: cap, daysLeft: Math.round(daysLeft), pace, state: "soldout", flash: null, raise: null };
  const soldOutIn = pace > 0 ? left / pace : Infinity;
  if (soldOutIn <= daysLeft && daysLeft > 3) return { pct, projected, daysLeft: Math.round(daysLeft), pace, state: "hot", flash: null, raise: 10 };
  if (pct < 60 && daysLeft > 2) return { pct, projected, daysLeft: Math.round(daysLeft), pace, state: "slow", flash: { pct: pct < 40 ? 25 : 15, hours: 48 }, raise: null };
  return { pct, projected, daysLeft: Math.round(daysLeft), pace, state: "track", flash: null, raise: null };
}
