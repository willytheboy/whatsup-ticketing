"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty } from "../_ui";

const STREAMS = ["tickets", "promotions", "services"];
const SCOPES = ["tenant", "organiser", "venue", "event"];
const BASES = ["platform_revenue", "face", "gross"];

/** Revenue-share rules: a percentage (or fixed amount) of each sale credited to a partner's payable account. */
export default function Rules() {
  const admin = useAdmin();
  const [rules, setRules] = useState<any[] | null>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [organisers, setOrganisers] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [form, setForm] = useState({ stream: "tickets", scope: "tenant", organiser_id: "", venue_id: "", event_id: "", partner_id: "", basis: "platform_revenue", pct: "10", fixed: "0", priority: "100", note: "" });
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    const t = admin.tenant.id;
    const [{ data: r }, { data: p }, { data: o }, { data: v }, { data: e }] = await Promise.all([
      sb().from("revenue_share_rules").select("*, partners(name,kind), organisers(name), venues(name), events(title)").eq("tenant_id", t).order("priority"),
      sb().from("partners").select("id,name,kind").eq("tenant_id", t).neq("kind", "platform").order("name"),
      sb().from("organisers").select("id,name").eq("tenant_id", t).order("name"),
      sb().from("venues").select("id,name").eq("tenant_id", t).order("name"),
      sb().from("events").select("id,title").eq("tenant_id", t).order("starts_at", { ascending: false }).limit(200),
    ]);
    setRules(r ?? []);
    setPartners(p ?? []);
    setOrganisers(o ?? []);
    setVenues(v ?? []);
    setEvents(e ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setMsg("");
    if (!form.partner_id) return setMsg("Choose the partner who receives the share.");
    const { error } = await sb().from("revenue_share_rules").insert({
      tenant_id: admin.tenant!.id, stream: form.stream, scope: form.scope, partner_id: form.partner_id,
      organiser_id: form.scope === "organiser" ? form.organiser_id || null : null,
      venue_id: form.scope === "venue" ? form.venue_id || null : null,
      event_id: form.scope === "event" ? form.event_id || null : null,
      basis: form.basis, pct: Number(form.pct || 0), fixed: Number(form.fixed || 0), priority: Number(form.priority || 100), note: form.note || null,
    });
    if (error) return setMsg(error.message);
    load();
  };
  const toggle = async (r: any) => { await sb().from("revenue_share_rules").update({ active: !r.active }).eq("id", r.id); load(); };
  const remove = async (r: any) => { if (confirm("Delete this rule?")) { await sb().from("revenue_share_rules").delete().eq("id", r.id); load(); } };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Revenue-share rules</h1>
          <p className="sub">Applied when an order, promotion or service charge is posted. Basis: platform revenue (fees), face value, or gross collected.</p>
        </div>
      </div>
      <Panel title="New rule">
        <div className="form">
          <div className="field"><span className="label">Stream</span><select value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })}>{STREAMS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><span className="label">Scope</span><select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>{SCOPES.map((s) => <option key={s}>{s}</option>)}</select></div>
          {form.scope === "organiser" && <div className="field"><span className="label">Organiser</span><select value={form.organiser_id} onChange={(e) => setForm({ ...form, organiser_id: e.target.value })}><option value="">—</option>{organisers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
          {form.scope === "venue" && <div className="field"><span className="label">Venue</span><select value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}><option value="">—</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>}
          {form.scope === "event" && <div className="field"><span className="label">Event</span><select value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}><option value="">—</option>{events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></div>}
          <div className="field"><span className="label">Partner (receives)</span><select value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}><option value="">—</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.kind}</option>)}</select></div>
          <div className="field"><span className="label">Basis</span><select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}>{BASES.map((b) => <option key={b}>{b}</option>)}</select></div>
          <div className="field"><span className="label">Percent</span><input inputMode="decimal" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} /></div>
          <div className="field"><span className="label">Fixed $</span><input inputMode="decimal" value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} /></div>
          <div className="field"><span className="label">Priority</span><input inputMode="numeric" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
          <div className="field"><span className="label">Note</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <button className="btn green sm" onClick={create}>Add rule</button>
        </div>
        {msg && <div className="err" style={{ marginTop: 8 }}>{msg}</div>}
      </Panel>
      <Panel>
        {rules === null ? <Empty>Loading…</Empty> : !rules.length ? <Empty>No rules yet — the platform keeps all fees.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Stream</th><th>Scope</th><th>Target</th><th>Partner</th><th>Basis</th><th className="r">Share</th><th className="r">Priority</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td><Tag>{r.stream}</Tag></td>
                    <td>{r.scope}</td>
                    <td>{r.organisers?.name ?? r.venues?.name ?? r.events?.title ?? "whole tenant"}</td>
                    <td>{r.partners?.name}<div className="dim">{r.partners?.kind}</div></td>
                    <td>{r.basis}</td>
                    <td className="r">{Number(r.pct)}%{Number(r.fixed) ? ` + $${Number(r.fixed).toFixed(2)}` : ""}</td>
                    <td className="r">{r.priority}</td>
                    <td><button className={`tag ${r.active ? "ok" : ""}`} onClick={() => toggle(r)}>{r.active ? "active" : "paused"}</button></td>
                    <td><button className="btn ghost xs" onClick={() => remove(r)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
