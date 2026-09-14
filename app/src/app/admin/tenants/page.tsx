"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty } from "../_ui";

/** Tenants: the countries WhatsUp runs in. A coming-soon tenant shows on the city sheet; a live one gets its own feed, fees and partners. */
export default function Tenants() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ slug: "", name: "", country: "", country_ar: "", currency: "USD", display_currency: "USD", fx: 1, admin_email: "", live: false });
  const [msg, setMsg] = useState("");
  const load = async () => { const { data } = await sb().from("tenants").select("id,slug,name,country,country_ar,base_currency,display_currency,fx_rate,live,buyer_fee_pct,organiser_fee_pct,created_at").order("created_at"); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  const create = async () => {
    setMsg("");
    const { data, error } = await sb().rpc("create_tenant", { p_slug: f.slug, p_name: f.name, p_country: f.country || f.name, p_country_ar: f.country_ar || null, p_currency: f.currency, p_display_currency: f.display_currency, p_fx: Number(f.fx) || 1, p_admin_email: f.admin_email || null, p_live: f.live });
    if (error) return setMsg(error.message);
    setMsg(`Created ${f.slug} (${String(data).slice(0, 8)}). Map a hostname to it (TENANT_HOSTS on Vercel) or deploy with NEXT_PUBLIC_TENANT=${f.slug} — see docs/SECOND-COUNTRY.md.`);
    setF({ slug: "", name: "", country: "", country_ar: "", currency: "USD", display_currency: "USD", fx: 1, admin_email: "", live: false }); load();
  };
  const toggleLive = async (r: any) => { await sb().from("tenants").update({ live: !r.live }).eq("id", r.id); load(); };
  return (
    <>
      <div className="bo-head"><div><h1>Tenants</h1><p className="sub">Super-admin only. Each tenant is one country: its own currency, fees, partners, ledger and feed.</p></div></div>
      <Panel title="New tenant">
        <div className="form">
          <div className="field"><span className="label">Slug</span><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="ae" /></div>
          <div className="field"><span className="label">Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="What's Up UAE" /></div>
          <div className="field"><span className="label">Country</span><input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="UAE" /></div>
          <div className="field"><span className="label">Country (Arabic)</span><input dir="rtl" value={f.country_ar} onChange={(e) => setF({ ...f, country_ar: e.target.value })} placeholder="الإمارات" /></div>
          <div className="field"><span className="label">Base currency</span><input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></div>
          <div className="field"><span className="label">Display currency</span><input value={f.display_currency} onChange={(e) => setF({ ...f, display_currency: e.target.value.toUpperCase() })} /></div>
          <div className="field"><span className="label">FX (display per base)</span><input type="number" value={f.fx} onChange={(e) => setF({ ...f, fx: Number(e.target.value) })} /></div>
          <div className="field"><span className="label">Country admin email</span><input value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} /></div>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={f.live} onChange={(e) => setF({ ...f, live: e.target.checked })} /> Live now (otherwise "coming soon")</label>
          <button className="btn green sm" disabled={!f.slug || !f.name} onClick={create}>Create</button>
        </div>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
      </Panel>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Slug</th><th>Name</th><th>Country</th><th>Currency</th><th className="r">FX</th><th className="r">Buyer fee</th><th className="r">Organiser fee</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="mono">{r.slug}</td><td>{r.name}</td><td>{r.country ?? "—"}{r.country_ar ? ` · ${r.country_ar}` : ""}</td><td>{r.base_currency} / {r.display_currency}</td><td className="r">{Number(r.fx_rate).toLocaleString("en-US")}</td><td className="r">{Math.round(Number(r.buyer_fee_pct) * 1000) / 10}%</td><td className="r">{Math.round(Number(r.organiser_fee_pct) * 1000) / 10}%</td><td><Tag tone={r.live ? "ok" : "warn"}>{r.live ? "live" : "coming soon"}</Tag></td><td><button className="btn ghost xs" onClick={() => toggleLive(r)}>{r.live ? "Set coming soon" : "Go live"}</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
