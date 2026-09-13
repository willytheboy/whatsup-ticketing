"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { fmtDate, signed } from "@/lib/config";
import { useAdmin, downloadCsv } from "../_lib";
import { Panel, Tag, statusTone, Empty } from "../_ui";

export default function Invoices() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    let q = sb().from("invoices").select("*, partners(name,kind)").eq("tenant_id", admin.tenant.id).order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data } = await q;
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const setInvoiceStatus = async (id: string, s: string) => {
    await sb().from("invoices").update({ status: s, ...(s === "issued" ? { issued_at: new Date().toISOString() } : {}) }).eq("id", id);
    load();
  };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Invoices</h1>
          <p className="sub">Issued automatically when a partner holds more door cash than they are owed; voidable while unpaid.</p>
        </div>
        <button className="btn ghost sm" onClick={() => downloadCsv("invoices.csv", (rows ?? []).map(({ partners, lines, ...r }) => ({ partner: partners?.name, ...r })))}>Export CSV</button>
      </div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{["", "draft", "issued", "paid", "void"].map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}</select>
      </div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No invoices.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Number</th><th>Partner</th><th>Direction</th><th>Period</th><th>Status</th><th>Due</th><th className="r">Total</th><th></th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/admin/invoices/${i.id}`} className="mono">{i.number}</Link></td>
                    <td>{i.partners?.name}</td>
                    <td>{i.direction === "partner_to_platform" ? "partner → WhatsUp" : "WhatsUp → partner"}</td>
                    <td className="w">{i.period_start ? `${fmtDate(i.period_start)} → ${fmtDate(i.period_end)}` : "—"}</td>
                    <td><Tag tone={statusTone(i.status)}>{i.status}</Tag></td>
                    <td className="w">{i.due_at ? fmtDate(i.due_at) : "—"}</td>
                    <td className="r"><b>{signed(i.total)}</b></td>
                    <td className="w">
                      {i.status === "draft" && <button className="btn ghost xs" onClick={() => setInvoiceStatus(i.id, "issued")}>Issue</button>}{" "}
                      {["draft", "issued"].includes(i.status) && <button className="btn ghost xs" onClick={() => confirm("Void this invoice?") && setInvoiceStatus(i.id, "void")}>Void</button>}
                    </td>
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
