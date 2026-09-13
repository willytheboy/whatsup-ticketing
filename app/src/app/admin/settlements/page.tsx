"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { fmtDate } from "@/lib/config";
import { useAdmin, daysAgo, today, downloadCsv } from "../_lib";
import { Panel, Tag, statusTone, Modal, Amount, Empty, when } from "../_ui";

export default function Settlements() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(daysAgo(1));
  const [msg, setMsg] = useState("");
  const [pay, setPay] = useState<any | null>(null);
  const [ref, setRef] = useState("");
  const [method, setMethod] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    let q = sb().from("settlements").select("*, partners(name,kind,payout_method)").eq("tenant_id", admin.tenant.id).order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data } = await q;
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setMsg("");
    const { data, error } = await sb().rpc("generate_settlements", { p_start: from, p_end: to });
    setMsg(error ? error.message : `${data} settlement(s) generated for ${from} → ${to}`);
    load();
  };
  const markPaid = async () => {
    setMsg("");
    const { error } = await sb().rpc("mark_settlement_paid", { p_id: pay.id, p_ref: ref || null, p_method: method || null });
    if (error) return setMsg(error.message);
    setPay(null);
    setRef("");
    load();
  };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Settlements</h1>
          <p className="sub">Weekly partner statements. Positive amounts are paid out; negative ones are invoiced to the partner.</p>
        </div>
        <button className="btn ghost sm" onClick={() => downloadCsv("settlements.csv", (rows ?? []).map(({ partners, statement, ...r }) => ({ partner: partners?.name, ...r })))}>Export CSV</button>
      </div>
      <Panel title="Generate statements">
        <div className="form">
          <div className="field"><span className="label">Period start</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><span className="label">Period end</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn green sm" onClick={generate}>Generate for all active partners</button>
        </div>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
      </Panel>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["", "scheduled", "requested", "processing", "paid", "failed"].map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
      </div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No settlements.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Partner</th><th>Period</th><th>Status</th><th>Method</th><th className="r">Amount</th><th>Invoice</th><th>Reference</th><th></th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/admin/partners/${s.partner_id}`}>{s.partners?.name}</Link><div className="dim">{s.partners?.kind}</div></td>
                    <td className="w">{fmtDate(s.period_start)} → {fmtDate(s.period_end)}</td>
                    <td><Tag tone={statusTone(s.status)}>{s.status}</Tag>{s.requested_at && <div className="dim">requested {when(s.requested_at)}</div>}</td>
                    <td>{s.method ?? s.partners?.payout_method ?? "—"}</td>
                    <td className="r"><b><Amount v={s.amount} /></b></td>
                    <td>{s.invoice_id ? <Link href={`/admin/invoices/${s.invoice_id}`}>invoice</Link> : "—"}</td>
                    <td className="mono">{s.reference ?? ""}</td>
                    <td>{s.status !== "paid" && <button className="btn green xs" onClick={() => { setPay(s); setMethod(s.method ?? s.partners?.payout_method ?? ""); }}>{Number(s.amount) >= 0 ? "Mark paid" : "Mark received"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {pay && (
        <Modal title={`${Number(pay.amount) >= 0 ? "Pay" : "Receive"} ${pay.partners?.name}`} onClose={() => setPay(null)}>
          <div className="dim">{fmtDate(pay.period_start)} → {fmtDate(pay.period_end)} · <Amount v={pay.amount} /></div>
          <div className="field"><span className="label">Reference</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transfer / Whish reference" /></div>
          <div className="field"><span className="label">Method</span><input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="whish, bank, cash" /></div>
          <button className="btn green sm" onClick={markPaid}>Confirm and post to ledger</button>
        </Modal>
      )}
    </>
  );
}
