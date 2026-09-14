"use client";
import { useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { PLANS, fmtDate } from "@/lib/config";
import { useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

/** Plans (monetisation model → upgrade ladder): pay as you sell on Free, grow on Pro, run a venue on Venue.
    Pro is bought in-app (sandbox, posts a service charge to the ledger); Venue is negotiated and set by the back office. */
export default function PlanPage() {
  const t = useT();
  const toast = useToast();
  const { user, org, reload } = useOrg();
  const [busy, setBusy] = useState(false);

  const upgrade = async (id: string) => {
    if (!org) return;
    setBusy(true);
    const { error } = await sb().rpc("upgrade_plan", { p_organiser: org.id, p_plan: id, p_method: "card" });
    setBusy(false);
    if (error) return toast(error.message);
    toast(id === "pro" ? t("upgraded") : t("savedOk"));
    reload();
  };
  const talk = () => window.open(`https://wa.me/?text=${encodeURIComponent(`What's Up · Venue plan for ${org?.name ?? "my venue"} — please call me.`)}`, "_blank");

  return (
    <>
      <TopBar back="/org" title={t("plansTitle")} />
      <main>
        <p className="meta" style={{ margin: 0 }}>{t("plansSub")}</p>
        {user === null && <Link href="/login?next=/org/plan" className="btn green">{t("signIn")}</Link>}
        {PLANS.map((p) => {
          const current = org?.plan === p.id;
          return (
            <div key={p.id} className={`planbox ${p.id === "pro" ? "pro" : p.id === "venue" ? "venue" : ""} ${current ? "on" : ""}`}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{t(`plan${p.id[0].toUpperCase()}${p.id.slice(1)}`)}</div>
                  <div className="price" style={{ marginTop: 4 }}>{p.price === null ? <small>{t("negotiated")}</small> : p.price === 0 ? t("free") : <>${p.price}<small> {t("perMo")}</small></>}</div>
                </div>
                {current ? <span className="tag ok">{t("current")}{org?.plan_until && p.id === "pro" ? ` · ${fmtDate(org.plan_until)}` : ""}</span> : null}
              </div>
              <ul>{p.features.map((f) => <li key={f}>{t(f)}</li>)}</ul>
              {org && !current && p.id === "pro" && <button className="btn green full" style={{ marginTop: 12 }} disabled={busy} onClick={() => upgrade("pro")}>{busy ? t("processing") : `${t("upgradePro")} · $49`}</button>}
              {org && !current && p.id === "venue" && <button className="btn full" style={{ marginTop: 12, background: "#fff", color: "#000" }} onClick={talk}>{t("talkToUs")} · WhatsApp</button>}
              {org && !current && p.id === "free" && org.plan === "pro" && <button className="btn line full" style={{ marginTop: 12 }} disabled={busy} onClick={() => upgrade("free")}>{t("planFree")}</button>}
            </div>
          );
        })}
        <p className="small" style={{ textAlign: "center" }}>{t("sandbox")}</p>
      </main>
    </>
  );
}
