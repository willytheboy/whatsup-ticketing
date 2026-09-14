"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { money, fmtDate, PROCESSING_PCT, hasPlan } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";
import { left as leftOf } from "@/lib/catalogue";

type Stat = { event_id: string; title: string; starts_at: string; status: string; capacity: number; sold: number; gross: number; buyer_fees: number; organiser_fees: number; processing_fees: number; deposits: number; checked_in: number };
type Tier = { id: string; event_id: string; name: string; name_ar: string | null; kind: string; capacity: number; sold: number; held: number };
type Ev = { id: string; slug: string; title: string; title_ar: string | null; kind: string; status: string; featured_until: string | null; venue_id: string | null };
type Stream = { id: string; slug: string; title: string; status: string; venue_id: string | null };

/** Venue dashboard (brief §5.13): KPIs, inventory with sell-through, payout waterfall, plan, station, tools. */
export default function OrganiserHub() {
  const t = useT();
  const lang = useLang();
  const { user, org, plan } = useOrg();
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [payout, setPayout] = useState<number | null>(null);

  useEffect(() => {
    if (!org) return;
    (async () => {
      const [{ data: s }, { data: e }, { data: p }] = await Promise.all([
        sb().from("organiser_event_stats").select("*").eq("organiser_id", org.id).order("starts_at"),
        sb().from("events").select("id,slug,title,title_ar,kind,status,featured_until,venue_id").eq("organiser_id", org.id).neq("status", "archived").order("starts_at"),
        sb().from("payouts").select("amount,status").eq("organiser_id", org.id).eq("status", "scheduled").order("period_end", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats((s ?? []) as Stat[]);
      const evs = (e ?? []) as Ev[];
      setEvents(evs);
      setPayout(p ? Number(p.amount) : null);
      if (evs.length) {
        const [{ data: tr }, { data: st }] = await Promise.all([
          sb().from("tiers").select("id,event_id,name,name_ar,kind,capacity,sold,held").in("event_id", evs.map((x) => x.id)).lt("capacity", 5000),
          sb().from("v_streams").select("id,slug,title,status,venue_id").in("venue_id", Array.from(new Set(evs.map((x) => x.venue_id).filter(Boolean))) as string[]),
        ]);
        setTiers((tr ?? []) as Tier[]);
        setStreams((st ?? []) as Stream[]);
      }
    })();
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = (k: keyof Stat) => (stats ?? []).reduce((a, s) => a + Number(s[k] ?? 0), 0);
  const gross = sum("gross"), fees = sum("buyer_fees"), orgFee = sum("organiser_fees"), proc = sum("processing_fees"), deposits = sum("deposits");
  const receive = gross - orgFee - proc + deposits;
  const name = (x: { title: string; title_ar: string | null }) => (lang === "ar" && x.title_ar ? x.title_ar : x.title);
  const unit = (k: string) => t(k === "table" ? "covers" : k === "daypass" ? "sunbeds" : k === "stay" ? "rooms" : k === "item" ? "stock" : "seats");

  return (
    <>
      <TopBar back="/profile" title={org?.name ?? t("orgMode")} right={org ? <Link href="/org/plan" className={`tag ${org.plan === "free" ? "" : "ok"}`}>{org.plan.toUpperCase()}</Link> : undefined} />
      <main>
        {user === null && <div className="card pad stack"><p style={{ margin: 0, fontSize: 14 }}>{t("signInOrg")}</p><Link href="/login?next=/org" className="btn green">{t("signIn")}</Link></div>}
        {user && org === null && <div className="empty">{t("noOrg")}</div>}
        {org && (
          <>
            <div className="row">
              <div><div className="eyebrow">{org.name}</div><div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{t("thisWeek")}</div></div>
              <Link href="/org/new" className="btn red sm">{t("newListing")}</Link>
            </div>
            <div className="kpis">
              <div className="kpi"><b className="num">{sum("sold")}</b><span>{t("sold")}</span></div>
              <div className="kpi"><b className="num">{money(gross)}</b><span>{t("gross")}</span></div>
              <div className="kpi"><b className="num">{sum("checked_in")}</b><span>{t("checkedInK")}</span></div>
              <div className="kpi"><b className="num">{money(payout ?? receive)}</b><span>{t("payout")}</span></div>
            </div>

            {/* the upgrade ladder */}
            <div className={`planbox ${org.plan === "pro" ? "pro" : org.plan === "venue" ? "venue" : ""}`}>
              <div className="row">
                <div>
                  <div className="eyebrow" style={org.plan === "venue" ? { color: "#B4B2A9" } : undefined}>{t("yourPlan")}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{t(`plan${org.plan[0].toUpperCase()}${org.plan.slice(1)}`)}{org.plan === "pro" && org.plan_until ? <span className="small" style={{ fontWeight: 400 }}> · {t("until")} {fmtDate(org.plan_until)}</span> : null}</div>
                  <div className="small" style={org.plan === "venue" ? { color: "#B4B2A9" } : undefined}>{t("platformFee")} {Math.round(plan.orgPct * 1000) / 10}% · {t(plan.features[1])}</div>
                </div>
                <Link href="/org/plan" className={`btn sm ${org.plan === "free" ? "green" : "line"}`} style={org.plan === "venue" ? { background: "#fff", color: "#000" } : undefined}>{org.plan === "free" ? t("upgradePro") : org.plan === "pro" ? t("planVenue") : t("current")}</Link>
              </div>
            </div>

            <h2 style={{ margin: "4px 0 0" }}>{t("inventory")}</h2>
            {events.map((e) => {
              const mine = tiers.filter((x) => x.event_id === e.id);
              const featured = e.featured_until && new Date(e.featured_until) > new Date();
              return (
                <div key={e.id} className="card pad">
                  <div className="row">
                    <div style={{ minWidth: 0 }}>
                      <div className="title" style={{ fontSize: 14 }}>{name(e)}{featured ? " ★" : ""}</div>
                      <div className="meta">{t(e.kind === "event" ? "events" : e.kind)} · {t(e.status === "live" ? "live" : e.status === "draft" ? "draftS" : e.status)}</div>
                    </div>
                    <div className="row" style={{ gap: 6, flex: "none" }}>
                      <Link href={`/org/promote/${e.id}`} className="btn xs green">{t("promote")}</Link>
                      <Link href={`/org/e/${e.id}`} className="btn xs line">{t("manage")}</Link>
                    </div>
                  </div>
                  {mine.map((x) => {
                    const pct = Math.min(100, Math.round(((x.sold + x.held) / Math.max(x.capacity, 1)) * 100));
                    return (
                      <div key={x.id} style={{ marginTop: 8 }}>
                        <div className="row"><span className="small" style={{ color: "var(--ink2)" }}>{lang === "ar" && x.name_ar ? x.name_ar : x.name} · {x.sold} / {x.capacity} {unit(x.kind)}</span><span className="small" style={{ color: pct >= 90 ? "var(--red-dark)" : "var(--ink3)" }}>{pct}%</span></div>
                        <div className="sell"><b style={{ width: `${pct}%`, background: pct >= 90 ? "var(--red)" : "var(--g2)" }} /></div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!events.length && <div className="small">{t("noListings")}</div>}

            <h2 style={{ margin: "4px 0 0" }}>{t("waterfall")}</h2>
            <div className="card pad" style={{ fontSize: 13 }}>
              {[
                [t("faceValue"), gross, ""], [t("buyerFees"), fees, "dim"], [`${t("platformFee")} ${Math.round(plan.orgPct * 1000) / 10}%`, -orgFee, ""],
                [`${t("procFee").replace("2.5", String(PROCESSING_PCT * 100))}`, -proc, ""], [t("tableDep"), deposits, ""], [t("youReceive"), receive, "total"],
              ].map(([label, v, cls], i) => (
                <div key={i} className="row" style={{ padding: "5px 0", ...(cls === "total" ? { borderTop: "1px solid var(--line)", fontWeight: 600, marginTop: 4 } : {}), ...(cls === "dim" ? { color: "var(--ink3)" } : {}) }}>
                  <span>{label}</span><span className="num">{Number(v) < 0 ? "−" : ""}${Math.abs(Number(v)).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <h2 style={{ margin: "4px 0 0" }}>{t("station")}</h2>
            <div className="card pad">
              {streams.length ? streams.map((s) => (
                <div key={s.id} className="row" style={{ padding: "4px 0" }}>
                  <div><div className="title" style={{ fontSize: 14 }}>{s.title}</div><div className="meta">{s.status === "live" ? `● ${t("liveNow")}` : t("offline")}</div></div>
                  <Link href={`/live/${s.slug}`} className="btn xs line">{t("open")}</Link>
                </div>
              )) : <div className="meta">{t("stationNote")}</div>}
              <div className="small" style={{ marginTop: 8 }}>{hasPlan(org.plan, "venue") ? t("manageStreams") : t("needsVenue")} {!hasPlan(org.plan, "venue") && <Link href="/org/plan" style={{ color: "var(--g1)", fontWeight: 600 }}>{t("upgrade")} →</Link>}</div>
            </div>

            <div className="grid2">
              <Link href="/org/promoters" className="btn line">{t("promoters")}{!hasPlan(org.plan, "pro") ? " · Pro" : ""}</Link>
              <Link href="/org/door" className="btn line">{t("doorScanner")}</Link>
              <Link href="/org/finance" className="btn green" style={{ gridColumn: "span 2" }}>{t("finance")}</Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
