"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { hasPlan, money } from "@/lib/config";
import { useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type P = { id: string; name: string; code: string; commission_pct: number; clicks: number; sales: number; commission: number; tier: string };
const TIER = { bronze: ["🥉", "Bronze", "برونز"], silver: ["🥈", "Silver", "فضة"], gold: ["🥇", "Gold", "ذهب"] } as Record<string, string[]>;

/** Promoters (brief §5.15, Pro plan): link, clicks, sales, earned, copy link; add a promoter. Attribution via ?ref=CODE. */
export default function PromotersPage() {
  const t = useT();
  const toast = useToast();
  const { user, org } = useOrg();
  const [rows, setRows] = useState<P[]>([]);
  const [name, setName] = useState("");
  const load = async () => { if (!org) return; const { data } = await sb().from("promoter_stats").select("*").eq("organiser_id", org.id).order("clicks", { ascending: false }); setRows((data ?? []) as P[]); };
  useEffect(() => { load(); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!org || !name.trim()) return;
    const code = name.trim().split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) + "-WU" + Math.floor(Math.random() * 90 + 10);
    const { error } = await sb().from("promoters").insert({ tenant_id: org.tenant_id, organiser_id: org.id, name: name.trim(), code, commission_pct: 8 });
    if (error) return toast(error.message);
    setName("");
    load();
  };
  const copy = (code: string) => { navigator.clipboard?.writeText(`${location.origin}/?ref=${code}`); toast(t("linkCopied")); };
  const kit = async (p: P) => {
    // share kit: a ready WhatsApp message with the promoter's link and the venue's next listing
    const { data: ev } = await sb().from("events").select("slug,title,starts_at").eq("organiser_id", org!.id).eq("status", "live").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle();
    const link = `${location.origin}/${ev ? `e/${ev.slug}` : ""}?ref=${p.code}`;
    const text = ev ? `${ev.title} 🎟️ ${t("kitLine")} ${link}` : `${org!.name} 🎟️ ${t("kitLine")} ${link}`;
    if (navigator.share) navigator.share({ text }).catch(() => null); else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const setPct = async (p: P, pct: number) => { await sb().from("promoters").update({ commission_pct: pct }).eq("id", p.id); load(); };
  const board = [...rows].sort((a, b) => Number(b.sales) - Number(a.sales) || Number(b.clicks) - Number(a.clicks));
  const gated = org && !hasPlan(org.plan, "pro");

  return (
    <>
      <TopBar back="/org" title={t("promoters")} />
      <main>
        <p className="meta" style={{ margin: 0 }}>{t("promotersNote")}</p>
        {user === null && <Link href="/login?next=/org/promoters" className="btn green">{t("signIn")}</Link>}
        {gated && (
          <div className="planbox pro">
            <div style={{ fontWeight: 800, fontSize: 16 }}>{t("needsPro")}</div>
            <div className="meta" style={{ margin: "4px 0 10px" }}>{t("planP2")} · {t("planP3")} · {t("planP4")}</div>
            <Link href="/org/plan" className="btn green full">{t("upgradePro")} · $49</Link>
          </div>
        )}
        {!gated && board.length > 1 && (
          <div className="card sand pad">
            <div className="eyebrow" style={{ marginBottom: 6 }}>{t("leaderboard")}</div>
            {board.slice(0, 5).map((p, i) => <div key={p.id} className="row" style={{ padding: "3px 0", fontSize: 13 }}><span>{i + 1}. {TIER[p.tier ?? "bronze"]?.[0]} {p.name}</span><span className="num">{p.sales} {t("sales")} · {money(Number(p.commission))}</span></div>)}
            <div className="small" style={{ marginTop: 6 }}>{t("tiersNote")}</div>
          </div>
        )}
        {!gated && board.map((p) => (
          <div key={p.id} className="card pad">
            <div className="row">
              <div><div className="title" style={{ fontSize: 14 }}>{TIER[p.tier ?? "bronze"]?.[0]} {p.name} <span className="tag" style={{ marginInlineStart: 4 }}>{TIER[p.tier ?? "bronze"]?.[1]}</span></div><div className="meta">?ref={p.code} · {p.commission_pct}%</div></div>
              <div className="row" style={{ gap: 6, flex: "none" }}>
                <button className="btn line sm" onClick={() => kit(p)}>{t("shareKit")}</button>
                <button className="btn line sm" onClick={() => copy(p.code)}>{t("copyLink")}</button>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10, fontSize: 13, justifyContent: "flex-start", gap: 16 }}>
              <span><b>{p.clicks}</b> {t("clicks")}</span><span><b>{p.sales}</b> {t("sales")}</span><span><b>{money(Number(p.commission))}</b> {t("earned")}</span>
              <span style={{ marginInlineStart: "auto" }} className="small">{t("commission")} <select value={p.commission_pct} onChange={(e) => setPct(p, Number(e.target.value))} style={{ width: "auto", padding: "2px 6px", minHeight: 28 }}>{[5, 8, 10, 12, 15].map((n) => <option key={n} value={n}>{n}%</option>)}</select></span>
            </div>
          </div>
        ))}
        {!gated && org && (
          <div className="field">
            <label>{t("pName")}</label>
            <div className="row"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nour K." style={{ flex: 1 }} /><button className="btn green" onClick={add}>{t("add")}</button></div>
          </div>
        )}
      </main>
    </>
  );
}
