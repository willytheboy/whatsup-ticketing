"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Code = { id: string; code: string; event_id: string | null; pct_off: number | null; fixed_off: number | null; max_uses: number | null; uses: number; starts_at: string | null; ends_at: string | null; active: boolean };
type Ev = { id: string; title: string };

/** Promo codes (spec §venue tools): percentage or fixed discounts, per listing or across the venue, with a cap and a window. */
export default function PromoCodes() {
  const t = useT();
  const toast = useToast();
  const { user, org } = useOrg();
  const [codes, setCodes] = useState<Code[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [f, setF] = useState({ code: "", kind: "pct", value: 10, event_id: "", max_uses: "", ends_at: "" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));

  const load = async () => {
    if (!org) return;
    const [{ data: c }, { data: e }] = await Promise.all([
      sb().from("promo_codes").select("*").eq("organiser_id", org.id).order("active", { ascending: false }).order("code"),
      sb().from("events").select("id,title").eq("organiser_id", org.id).neq("status", "archived").order("starts_at"),
    ]);
    setCodes((c ?? []) as Code[]); setEvents((e ?? []) as Ev[]);
  };
  useEffect(() => { load(); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!org) return;
    const code = f.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 3) return setErr(t("codeShort"));
    setErr("");
    const { error } = await sb().from("promo_codes").insert({ tenant_id: org.tenant_id, organiser_id: org.id, code, event_id: f.event_id || null, pct_off: f.kind === "pct" ? Number(f.value) : null, fixed_off: f.kind === "fixed" ? Number(f.value) : null, max_uses: f.max_uses ? Number(f.max_uses) : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null, active: true });
    if (error) return setErr(error.code === "23505" ? t("codeTaken") : error.message);
    setF({ code: "", kind: "pct", value: 10, event_id: "", max_uses: "", ends_at: "" });
    toast(t("codeAdded")); load();
  };
  const toggle = async (c: Code) => { await sb().from("promo_codes").update({ active: !c.active }).eq("id", c.id); load(); };
  const remove = async (c: Code) => { await sb().from("promo_codes").delete().eq("id", c.id); load(); };

  return (
    <>
      <TopBar back="/org" title={t("promoCodes")} />
      <main>
        {user === null && <div className="card pad stack"><p style={{ margin: 0 }}>{t("signInOrg")}</p><Link href="/login?next=/org/codes" className="btn green">{t("signIn")}</Link></div>}
        {org && (
          <>
            <div className="small">{t("codesNote")}</div>
            <div className="card pad stack">
              <div className="grid2">
                <label className="field"><span className="lbl">{t("promo")}</span><input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="SUMMER10" /></label>
                <label className="field"><span className="lbl">{t("listing")}</span><select value={f.event_id} onChange={(e) => set("event_id", e.target.value)}><option value="">{t("allListings")}</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
              </div>
              <div className="grid3">
                <label className="field"><span className="lbl">{t("discountType")}</span><select value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="pct">%</option><option value="fixed">$</option></select></label>
                <label className="field"><span className="lbl">{t("value")}</span><input type="number" inputMode="decimal" value={f.value} onChange={(e) => set("value", e.target.value)} /></label>
                <label className="field"><span className="lbl">{t("maxUses")}</span><input type="number" inputMode="numeric" value={f.max_uses} onChange={(e) => set("max_uses", e.target.value)} placeholder="∞" /></label>
              </div>
              <label className="field"><span className="lbl">{t("endsAt")}</span><input type="datetime-local" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></label>
              {err && <div className="err">{err}</div>}
              <button className="btn green" onClick={add}>{t("add")}</button>
            </div>
            {codes.map((c) => (
              <div key={c.id} className="card pad row between">
                <div>
                  <div className="title" style={{ fontSize: 15, opacity: c.active ? 1 : 0.5 }}>{c.code} <span className="tag ok" style={{ marginInlineStart: 6 }}>{c.pct_off ? `${c.pct_off}%` : `$${c.fixed_off}`}</span></div>
                  <div className="meta">{events.find((e) => e.id === c.event_id)?.title ?? t("allListings")} · {c.uses}{c.max_uses ? `/${c.max_uses}` : ""} {t("uses")}{c.ends_at ? ` · ${t("until")} ${new Date(c.ends_at).toLocaleDateString("en-GB")}` : ""}</div>
                </div>
                <div className="row" style={{ gap: 6, flex: "none" }}>
                  <button className="btn xs line" onClick={() => toggle(c)}>{c.active ? t("pause") : t("resume")}</button>
                  {!c.uses && <button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => remove(c)}>✕</button>}
                </div>
              </div>
            ))}
            {!codes.length && <div className="empty">{t("noCodes")}</div>}
          </>
        )}
      </main>
    </>
  );
}
