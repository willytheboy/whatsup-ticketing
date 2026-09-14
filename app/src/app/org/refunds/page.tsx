"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Refund = { id: string; event_title: string; buyer: string | null; buyer_phone: string | null; total: number; payment_method: string; refund_status: string; refund_requested_at: string; addons: any[] };

/** Refund queue for the venue: requests per the listing policy or the refund-protection add-on. Approving voids the tickets and frees the seats. */
export default function Refunds() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { user, org } = useOrg();
  const [rows, setRows] = useState<Refund[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => { if (!org) return; const { data } = await sb().from("v_org_refunds").select("*").eq("organiser_id", org.id).order("refund_requested_at", { ascending: false }).limit(100); setRows((data ?? []) as Refund[]); };
  useEffect(() => { load(); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (id: string, decision: "refunded" | "declined") => {
    setBusy(true);
    const { error } = await sb().rpc("org_refund_order", { p_order: id, p_decision: decision });
    setBusy(false);
    if (error) return toast(error.message);
    toast(decision === "refunded" ? t("refunded") : t("declined")); load();
  };
  return (
    <>
      <TopBar back="/org" title={t("refunds")} />
      <main>
        {user === null && <div className="card pad stack"><p style={{ margin: 0 }}>{t("signInOrg")}</p><Link href="/login?next=/org/refunds" className="btn green">{t("signIn")}</Link></div>}
        {org && <div className="small">{t("refundsNote")}</div>}
        {org && !rows.length && <div className="empty">{t("noRefunds")}</div>}
        {rows.map((r) => (
          <div key={r.id} className="card pad">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="title" style={{ fontSize: 14 }}>{r.event_title}</div>
                <div className="meta">{r.buyer ?? "—"}{r.buyer_phone ? ` · ${r.buyer_phone}` : ""} · {money(Number(r.total))} · {r.payment_method}</div>
                <div className="meta">{new Date(r.refund_requested_at).toLocaleString(lang === "ar" ? "ar-LB" : "en-GB")}{(r.addons ?? []).some((a: any) => a.kind === "refund_protection") ? ` · ${t("protected")}` : ""}</div>
              </div>
              <span className={`tag ${r.refund_status === "refunded" ? "ok" : r.refund_status === "declined" ? "" : "gold"}`}>{t(r.refund_status === "requested" ? "requested" : r.refund_status)}</span>
            </div>
            {r.refund_status === "requested" && <div className="grid2" style={{ marginTop: 8 }}><button className="btn sm green" disabled={busy} onClick={() => decide(r.id, "refunded")}>{t("approveRefund")}</button><button className="btn sm line" disabled={busy} onClick={() => decide(r.id, "declined")}>{t("decline")}</button></div>}
          </div>
        ))}
      </main>
    </>
  );
}
