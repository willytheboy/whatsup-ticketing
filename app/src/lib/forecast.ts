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
