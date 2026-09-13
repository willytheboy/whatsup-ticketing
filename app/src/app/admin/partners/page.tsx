"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { useAdmin, downloadCsv } from "../_lib";
import { Panel, Tag, Amount, Empty, when } from "../_ui";

const KINDS = ["organiser", "venue", "promoter", "media", "service_provider"];

export default function Partners() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ kind: "media", name: "", email: "" });
  const [err, setErr] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    const [{ data: p }, { data: b }] = await Promise.all([
      sb().from("partners").select("*").eq("tenant_id", admin.tenant.id).order("kind").order("name"),
      sb().from("v_partner_balances").select("*").eq("tenant_id", admin.tenant.id),
    ]);
    const bal = new Map((b ?? []).map((x: any) => [x.partner_id, x]));
    setRows((p ?? []).map((x: any) => ({ ...x, ...(bal.get(x.id) ?? {}) })));
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setErr("");
    if (!form.name.trim()) return setErr("Name is required");
    const { error } = await sb().from("partners").insert({ tenant_id: admin.tenant!.id, kind: form.kind, name: form.name.trim(), email: form.email || null });
    if (error) return setErr(error.message);
    setForm({ kind: "media", name: "", email: "" });
    load();
  };

  const list = (rows ?? []).filter((r) => (!kind || r.kind === kind) && (!q || `${r.name} ${r.name_ar ?? ""} ${r.email ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Partners</h1>
          <p className="sub">Organisers, venues, promoters, media and service providers — everyone with a ledger account.</p>
        </div>
        <button className="btn ghost sm" onClick={() => downloadCsv("partners.csv", list)}>Export CSV</button>
      </div>
      <div className="toolbar">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          <option value="platform">platform</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <Panel>
        {rows === null ? (
          <Empty>Loading…</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Partner</th><th>Kind</th><th>Payout</th><th className="r">Payable</th><th className="r">Receivable</th><th className="r">Net</th><th>Last activity</th><th>Active</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="click" onClick={() => (location.href = `/admin/partners/${p.id}`)}>
                    <td><Link href={`/admin/partners/${p.id}`}>{p.name}</Link>{p.name_ar && <div className="dim">{p.name_ar}</div>}</td>
                    <td><Tag>{p.kind}</Tag></td>
                    <td>{p.payout_method ?? "—"}</td>
                    <td className="r"><Amount v={p.payable} /></td>
                    <td className="r"><Amount v={p.receivable} /></td>
                    <td className="r"><b><Amount v={p.net_balance} /></b></td>
                    <td className="w dim">{p.last_activity ? when(p.last_activity) : "—"}</td>
                    <td>{p.active ? <Tag tone="ok">active</Tag> : <Tag tone="bad">inactive</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Add a partner">
        <div className="dim" style={{ marginBottom: 8 }}>Organisers, venues and promoters are created automatically from their records; add media outlets and service providers here.</div>
        <div className="form">
          <div className="field"><span className="label">Kind</span><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div className="field"><span className="label">Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><span className="label">Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <button className="btn green sm" onClick={create}>Create</button>
        </div>
        {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      </Panel>
    </>
  );
}
