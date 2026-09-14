"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { money, hasPlan } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Insights = { buyers: number; repeat_rate: number; by_city: { city: string; n: number }[]; by_method: { method: string; n: number }[]; price_bands: { band: string; n: number }[]; best_days: { dow: string; n: number }[]; lead_days: number; no_show: number; waitlist: number; events: { id: string; title: string; starts_at: string; sold: number; capacity: number; gross: number; checked_in: number }[] };

/** Audience insights (Pro): who buys, where they are, how they pay, when they book — and a buyer export as CSV. */
export default function InsightsPage() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { user, org } = useOrg();
  const [d, setD] = useState<Insights | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!org) return;
    sb().rpc("org_insights", { p_org: org.id }).then(({ data, error }) => { if (error) setErr(error.message); else setD(data as Insights); });
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = async () => {
    if (!org) return;
    const { data, error } = await sb().rpc("org_buyers", { p_org: org.id });
    if (error || !data?.length) return toast(error?.message ?? t("noResults"));
    const cols = ["name", "phone", "email", "orders", "spend", "last_order", "city"];
    const csv = [cols.join(","), ...data.map((r: any) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = `whatsup-buyers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  const Bar = ({ rows, k }: { rows: { n: number }[]; k: (r: any) => string }) => {
    const max = Math.max(1, ...rows.map((r) => Number(r.n)));
    return <div className="stack" style={{ gap: 6 }}>{rows.map((r, i) => <div key={i}><div className="row"><span className="small" style={{ color: "var(--ink2)" }}>{k(r)}</span><span className="small num">{r.n}</span></div><div className="sell"><b style={{ width: `${Math.round((Number(r.n) / max) * 100)}%`, background: "var(--g2)" }} /></div></div>)}</div>;
  };
  const dow = (x: string) => ({ Mon: ["Mon", "الاتنين"], Tue: ["Tue", "التلاتا"], Wed: ["Wed", "الأربعا"], Thu: ["Thu", "الخميس"], Fri: ["Fri", "الجمعة"], Sat: ["Sat", "السبت"], Sun: ["Sun", "الأحد"] } as Record<string, string[]>)[x]?.[lang === "ar" ? 1 : 0] ?? x;

  return (
    <>
      <TopBar back="/org" title={t("insights")} right={org && hasPlan(org.plan, "pro") ? <button className="btn xs line" onClick={exportCsv}>{t("exportCsv")}</button> : undefined} />
      <main>
        {user === null && <div className="card pad stack"><p style={{ margin: 0 }}>{t("signInOrg")}</p><Link href="/login?next=/org/insights" className="btn green">{t("signIn")}</Link></div>}
        {org && !hasPlan(org.plan, "pro") && (
          <div className="planbox pro">
            <div className="eyebrow">{t("needsPro")}</div>
            <div style={{ fontSize: 16, fontWeight: 700, margin: "4px 0 8px" }}>{t("insightsPitch")}</div>
            <Link href="/org/plan" className="btn sm green">{t("upgradePro")}</Link>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {d && (
          <>
            <div className="kpis">
              <div className="kpi"><b className="num">{d.buyers}</b><span>{t("buyers")}</span></div>
              <div className="kpi"><b className="num">{d.repeat_rate}%</b><span>{t("repeat")}</span></div>
              <div className="kpi"><b className="num">{d.lead_days}d</b><span>{t("leadTime")}</span></div>
              <div className="kpi"><b className="num">{d.no_show}%</b><span>{t("noShow")}</span></div>
            </div>
            {hasPlan(org?.plan, "pro") ? (
              <>
                <div className="card pad"><div className="eyebrow" style={{ marginBottom: 8 }}>{t("byCity")}</div><Bar rows={d.by_city} k={(r) => r.city} /></div>
                <div className="card pad"><div className="eyebrow" style={{ marginBottom: 8 }}>{t("byMethod")}</div><Bar rows={d.by_method} k={(r) => t(r.method === "cash_door" ? "cash" : r.method)} /></div>
                <div className="card pad"><div className="eyebrow" style={{ marginBottom: 8 }}>{t("priceBands")}</div><Bar rows={d.price_bands} k={(r) => r.band} /></div>
                <div className="card pad"><div className="eyebrow" style={{ marginBottom: 8 }}>{t("bestDays")}</div><Bar rows={d.best_days} k={(r) => dow(r.dow)} /></div>
                <div className="card pad">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>{t("perListing")}</div>
                  {d.events.map((e) => <div key={e.id} className="row" style={{ padding: "5px 0", borderTop: "1px solid var(--line)" }}><span className="small" style={{ color: "var(--ink2)" }}>{e.title}</span><span className="small num">{e.sold}/{e.capacity} · {money(Number(e.gross))} · {e.sold ? Math.round((e.checked_in / e.sold) * 100) : 0}% {t("checkedInK")}</span></div>)}
                </div>
                <div className="small">{d.waitlist} {t("waiting")} · {t("insightsFoot")}</div>
              </>
            ) : <div className="small" style={{ textAlign: "center" }}>{t("insightsLocked")}</div>}
          </>
        )}
      </main>
    </>
  );
}
