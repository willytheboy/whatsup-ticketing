"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { useConfig } from "@/components/Config";
import { sb } from "@/lib/supabase-browser";
import { money, fmtDate, PROCESSING_PCT, hasPlan } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";
import { nudgesFor, forecast } from "@/lib/forecast";

type Stat = { event_id: string; title: string; starts_at: string; status: string; capacity: number; sold: number; gross: number; buyer_fees: number; organiser_fees: number; processing_fees: number; deposits: number; checked_in: number };
type Tier = { id: string; event_id: string; name: string; name_ar: string | null; kind: string; capacity: number; sold: number; held: number };
type Ev = { id: string; slug: string; title: string; title_ar: string | null; kind: string; status: string; featured_until: string | null; venue_id: string | null; cover_url: string | null; starts_at: string; created_at: string };
type Stream = { id: string; slug: string; title: string; status: string; venue_id: string | null; playback_url: string | null; source: string | null };
type Day = { day: string; tickets: number; gross: number };
type Promoter = { name: string; clicks: number; sales: number; tier: string };

/** Venue dashboard (brief §5.13): KPIs, 7-day chart, nudges, inventory with sell-through and forecast, payout waterfall, plan, station, tools. */
export default function OrganiserHub() {
  const t = useT();
  const { features } = useConfig();
  const lang = useLang();
  const toast = useToast();
  const { user, org, plan, reload } = useOrg();
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [payout, setPayout] = useState<number | null>(null);
  const [refunds, setRefunds] = useState(0);
  const [waits, setWaits] = useState<Record<string, number>>({});
  const [wa, setWa] = useState<string>("");
  const [editWa, setEditWa] = useState(false);
  const [streamUrl, setStreamUrl] = useState<Record<string, string>>({});
  const [cq, setCq] = useState("");
  const [copilot, setCopilot] = useState<string>("");
  const [thinking, setThinking] = useState(false);

  const load = async () => {
    if (!org) return;
    setWa(org.whatsapp ?? "");
    const since = new Date(Date.now() - 6 * 864e5); since.setHours(0, 0, 0, 0);
    const [{ data: s }, { data: e }, { data: p }, { data: d }, { data: pr }, { count: rc }] = await Promise.all([
      sb().from("organiser_event_stats").select("*").eq("organiser_id", org.id).order("starts_at"),
      sb().from("events").select("id,slug,title,title_ar,kind,status,featured_until,venue_id,cover_url,starts_at,created_at").eq("organiser_id", org.id).neq("status", "archived").order("starts_at"),
      sb().from("payouts").select("amount,status").eq("organiser_id", org.id).eq("status", "scheduled").order("period_end", { ascending: false }).limit(1).maybeSingle(),
      sb().from("organiser_daily_sales").select("day,tickets,gross").eq("organiser_id", org.id).gte("day", since.toISOString().slice(0, 10)).order("day"),
      sb().from("promoter_stats").select("name,clicks,sales,tier").eq("organiser_id", org.id),
      sb().from("v_org_refunds").select("id", { count: "exact", head: true }).eq("organiser_id", org.id).eq("refund_status", "requested"),
    ]);
    setStats((s ?? []) as Stat[]);
    const evs = (e ?? []) as Ev[];
    setEvents(evs);
    setPayout(p ? Number(p.amount) : null);
    setDays((d ?? []) as Day[]);
    setPromoters((pr ?? []) as Promoter[]);
    setRefunds(rc ?? 0);
    if (evs.length) {
      const [{ data: tr }, { data: st }] = await Promise.all([
        sb().from("tiers").select("id,event_id,name,name_ar,kind,capacity,sold,held").in("event_id", evs.map((x) => x.id)).lt("capacity", 5000),
        sb().from("v_streams").select("id,slug,title,status,venue_id,playback_url,source").in("venue_id", Array.from(new Set(evs.map((x) => x.venue_id).filter(Boolean))) as string[]),
      ]);
      setTiers((tr ?? []) as Tier[]);
      setStreams((st ?? []) as Stream[]);
      const ids = (tr ?? []).map((x: any) => x.id);
      if (ids.length) {
        const { data: w } = await sb().from("waitlist").select("tier_id").in("tier_id", ids).is("notified_at", null);
        const m: Record<string, number> = {}; for (const r of w ?? []) m[r.tier_id] = (m[r.tier_id] ?? 0) + 1; setWaits(m);
      }
    }
  };
  useEffect(() => { load(); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveWa = async () => {
    if (!org) return;
    const v = wa.replace(/[^\d+]/g, "");
    const { error } = await sb().from("organisers").update({ whatsapp: v || null }).eq("id", org.id);
    if (error) return toast(error.message);
    setEditWa(false); toast(t("savedOk")); reload();
  };
  const setLive = async (s: Stream, status: "live" | "ended" | "offline") => {
    if (status === "live" && streamUrl[s.id]) await sb().rpc("org_set_stream_url", { p_stream: s.id, p_source: "hls", p_url: streamUrl[s.id] });
    const { error } = await sb().rpc("org_set_stream_status", { p_stream: s.id, p_status: status });
    if (error) return toast(error.message);
    toast(status === "live" ? t("onAirNow") : t("offline")); load();
  };

  const sum = (k: keyof Stat) => (stats ?? []).reduce((a, s) => a + Number(s[k] ?? 0), 0);
  const gross = sum("gross"), fees = sum("buyer_fees"), orgFee = sum("organiser_fees"), proc = sum("processing_fees"), deposits = sum("deposits");
  const receive = gross - orgFee - proc + deposits;
  const name = (x: { title: string; title_ar: string | null }) => (lang === "ar" && x.title_ar ? x.title_ar : x.title);
  const unit = (k: string) => t(k === "table" ? "covers" : k === "daypass" ? "sunbeds" : k === "stay" ? "rooms" : k === "item" ? "stock" : "seats");
  const week: Day[] = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); const key = d.toISOString().slice(0, 10); const row = days.find((x) => x.day === key); return { day: key, tickets: Number(row?.tickets ?? 0), gross: Number(row?.gross ?? 0) }; });
  const maxG = Math.max(1, ...week.map((x) => x.gross));
  const top = [...(stats ?? [])].sort((a, b) => Number(b.gross) - Number(a.gross)).slice(0, 3);
  const clicks = promoters.reduce((a, p) => a + Number(p.clicks), 0), psales = promoters.reduce((a, p) => a + Number(p.sales), 0);
  const nudges = org ? nudgesFor({ events, tiers, stats: stats ?? [], refunds, waits, plan: org.plan, whatsapp: org.whatsapp ?? null, lang }) : [];
  const askCopilot = async (question?: string) => {
    setThinking(true);
    const slow = events.filter((e) => e.status === "live").map((e) => ({ e, f: forecast(e, tiers) })).filter((x) => x.f && x.f.pct < 40 && x.f.daysLeft <= 10).map((x) => x.e.title);
    const facts = { sold: sum("sold"), gross: Math.round(gross), checked_in: sum("checked_in"), week: week.map((w) => ({ day: w.day, gross: w.gross })), slow, waiting: Object.values(waits).reduce((a, n) => a + n, 0), refunds, plan: org?.plan, listings: events.map((e) => ({ title: e.title, status: e.status, starts_at: e.starts_at, forecast: forecast(e, tiers)?.pct ?? null })), promoters: { clicks, sales: psales } };
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "copilot", q: question ?? cq, lang, facts }) }).then((x) => x.json()).catch(() => null);
    setCopilot(r?.text ?? t("noResults")); setThinking(false);
  };

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

            {/* 7-day sales */}
            <div className="card pad">
              <div className="row between"><span className="eyebrow">{t("last7")}</span><span className="small num">{money(week.reduce((a, x) => a + x.gross, 0))} · {week.reduce((a, x) => a + x.tickets, 0)} {t("sold")}</span></div>
              <div className="bars" style={{ height: 80, marginTop: 10, marginBottom: 20 }}>
                {week.map((x) => (
                  <div key={x.day} style={{ height: `${Math.max(4, Math.round((x.gross / maxG) * 100))}%`, background: x.gross ? "var(--g2)" : "var(--sand)" }} title={`${x.day} · ${money(x.gross)}`}>
                    <span>{new Date(x.day).toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", { weekday: "short" })}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* nudges */}
            {nudges.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {nudges.slice(0, 3).map((n, i) => (
                  <Link key={i} href={n.href} className="card pad row" style={{ borderInlineStart: `4px solid ${n.tone === "red" ? "var(--red)" : n.tone === "amber" ? "#B45309" : "var(--g2)"}` }}>
                    <div style={{ minWidth: 0 }}><div className="title" style={{ fontSize: 14 }}>{n.title}</div><div className="meta">{n.body}</div></div>
                    <span className="btn xs line" style={{ flex: "none" }}>{n.cta}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* venue copilot */}
            <div className="card pad stack" style={{ gap: 8 }}>
              <div className="row between"><span className="eyebrow">✨ {t("copilot")}</span>{!copilot && <button className="btn xs line" onClick={() => askCopilot(t("copilotQ1"))} disabled={thinking}>{t("copilotQ1")}</button>}</div>
              {copilot && <div style={{ fontSize: 14, lineHeight: 1.5 }}>{copilot}</div>}
              <div className="row" style={{ gap: 8 }}><input value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askCopilot()} placeholder={t("copilotPh")} style={{ flex: 1 }} /><button className="btn sm green" onClick={() => askCopilot()} disabled={thinking || !cq.trim()}>{thinking ? "…" : t("askConcierge").split(" ")[0]}</button></div>
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
              const fc = forecast(e, mine);
              return (
                <div key={e.id} className="card pad">
                  <div className="row">
                    <div style={{ minWidth: 0 }}>
                      <div className="title" style={{ fontSize: 14 }}>{name(e)}{featured ? " ★" : ""}</div>
                      <div className="meta">{t(e.kind === "event" ? "events" : e.kind)} · {t(e.status === "live" ? "live" : e.status === "draft" ? "draftS" : e.status)}{fc ? ` · ${t("forecast")} ${fc.pct}%${fc.soldOutBy ? ` · ${t("soldOutBy")} ${fmtDate(fc.soldOutBy)}` : ""}` : ""}</div>
                    </div>
                    <div className="row" style={{ gap: 6, flex: "none" }}>
                      {features.promote && <Link href={`/org/promote/${e.id}`} className="btn xs green">{t("promote")}</Link>}
                      <Link href={`/org/e/${e.id}`} className="btn xs line">{t("manage")}</Link>
                    </div>
                  </div>
                  {mine.map((x) => {
                    const pct = Math.min(100, Math.round(((x.sold + x.held) / Math.max(x.capacity, 1)) * 100));
                    return (
                      <div key={x.id} style={{ marginTop: 8 }}>
                        <div className="row"><span className="small" style={{ color: "var(--ink2)" }}>{lang === "ar" && x.name_ar ? x.name_ar : x.name} · {x.sold} / {x.capacity} {unit(x.kind)}{waits[x.id] ? ` · ${waits[x.id]} ${t("waiting")}` : ""}</span><span className="small" style={{ color: pct >= 90 ? "var(--red-dark)" : "var(--ink3)" }}>{pct}%</span></div>
                        <div className="sell"><b style={{ width: `${pct}%`, background: pct >= 90 ? "var(--red)" : "var(--g2)" }} /></div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!events.length && <div className="small">{t("noListings")}</div>}

            {top.length > 1 && (
              <div className="card pad">
                <div className="eyebrow">{t("topListings")}</div>
                {top.map((s, i) => <div key={s.event_id} className="row" style={{ padding: "6px 0", borderTop: i ? "1px solid var(--line)" : undefined }}><span className="small" style={{ color: "var(--ink2)" }}>{i + 1}. {s.title}</span><span className="small num">{money(Number(s.gross))} · {s.sold}</span></div>)}
              </div>
            )}

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

            {features.promoters && promoters.length > 0 && (
              <div className="card pad">
                <div className="row between"><span className="eyebrow">{t("promoters")}</span><Link href="/org/promoters" className="small" style={{ color: "var(--g1)", fontWeight: 600 }}>{t("open")} →</Link></div>
                <div className="small" style={{ marginTop: 6 }}>{clicks} {t("clicks")} → {psales} {t("sales")} · {clicks ? Math.round((psales / clicks) * 100) : 0}% {t("conversion")}</div>
              </div>
            )}

            {features.station && <><h2 style={{ margin: "4px 0 0" }}>{t("station")}</h2>
            <div className="card pad">
              {streams.length ? streams.map((s) => (
                <div key={s.id} style={{ padding: "4px 0" }}>
                  <div className="row">
                    <div><div className="title" style={{ fontSize: 14 }}>{s.title}</div><div className="meta">{s.status === "live" ? `● ${t("liveNow")}` : t("offline")}</div></div>
                    <div className="row" style={{ gap: 6, flex: "none" }}>
                      <Link href={`/live/${s.slug}`} className="btn xs line">{t("open")}</Link>
                      {hasPlan(org.plan, "venue") && (s.status === "live" ? <button className="btn xs line" onClick={() => setLive(s, "ended")}>{t("endStream")}</button> : <button className="btn xs red" onClick={() => setLive(s, "live")}>{t("goLive")}</button>)}
                    </div>
                  </div>
                  {hasPlan(org.plan, "venue") && s.status !== "live" && <div className="field" style={{ marginTop: 6 }}><input value={streamUrl[s.id] ?? s.playback_url ?? ""} onChange={(e) => setStreamUrl({ ...streamUrl, [s.id]: e.target.value })} placeholder={t("streamUrlPh")} /></div>}
                </div>
              )) : <div className="meta">{t("stationNote")}</div>}
              <div className="small" style={{ marginTop: 8 }}>{hasPlan(org.plan, "venue") ? t("streamHelp") : t("needsVenue")} {!hasPlan(org.plan, "venue") && <Link href="/org/plan" style={{ color: "var(--g1)", fontWeight: 600 }}>{t("upgrade")} →</Link>}</div>
            </div></>}

            <div className="card pad">
              <div className="row between">
                <div><div className="eyebrow">{t("orgWhatsapp")}</div><div className="small">{t("orgWhatsappNote")}</div></div>
                {!editWa && <button className="btn xs line" onClick={() => setEditWa(true)}>{org.whatsapp ? org.whatsapp : t("add")}</button>}
              </div>
              {editWa && <div className="row" style={{ marginTop: 8, gap: 8 }}><input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="+961 3 000 000" style={{ flex: 1 }} /><button className="btn sm green" onClick={saveWa}>{t("save")}</button></div>}
            </div>

            <div className="grid2">
              {features.promoters && <Link href="/org/promoters" className="btn line">{t("promoters")}{!hasPlan(org.plan, "pro") ? " · Pro" : ""}</Link>}
              <Link href="/org/door" className="btn line">{t("doorScanner")}</Link>
              {features.codes && <Link href="/org/codes" className="btn line">{t("promoCodes")}</Link>}
              {features.insights && <Link href="/org/insights" className="btn line">{t("insights")}{!hasPlan(org.plan, "pro") ? " · Pro" : ""}</Link>}
              <Link href="/org/refunds" className="btn line">{t("refunds")}{refunds ? ` · ${refunds}` : ""}</Link>
              {features.developers && <Link href="/org/developers" className="btn line">{t("developers")}</Link>}
              <Link href="/org/finance" className="btn green" style={{ gridColumn: "span 2" }}>{t("finance")}</Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
