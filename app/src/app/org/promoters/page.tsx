"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { hasPlan, money } from "@/lib/config";
import { useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type P = { id: string; name: string; code: string; commission_pct: number; clicks: number; sales: number; commission: number };

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
        {!gated && rows.map((p) => (
          <div key={p.id} className="card pad">
            <div className="row">
              <div><div className="title" style={{ fontSize: 14 }}>{p.name}</div><div className="meta">?ref={p.code} · {p.commission_pct}%</div></div>
              <button className="btn line sm" onClick={() => copy(p.code)}>{t("copyLink")}</button>
            </div>
            <div className="row" style={{ marginTop: 10, fontSize: 13, justifyContent: "flex-start", gap: 16 }}>
              <span><b>{p.clicks}</b> {t("clicks")}</span><span><b>{p.sales}</b> {t("sales")}</span><span><b>{money(Number(p.commission))}</b> {t("earned")}</span>
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
