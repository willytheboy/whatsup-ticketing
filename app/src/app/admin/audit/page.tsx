"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin, short, downloadCsv } from "../_lib";
import { Panel, Tag, Empty, when } from "../_ui";

const TABLES = ["", "orders", "partners", "invoices", "settlements", "provider_batches", "revenue_share_rules", "service_charges", "promotion_orders"];

export default function Audit() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [table, setTable] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (!admin.tenant) return;
    let q = sb().from("audit_log").select("*").eq("tenant_id", admin.tenant.id).order("at", { ascending: false }).limit(300);
    if (table) q = q.eq("table_name", table);
    q.then(({ data }) => setRows(data ?? []));
  }, [admin.tenant, table]);

  const diff = (a: any, b: any) => {
    if (!a || !b) return null;
    return Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Audit trail</h1>
          <p className="sub">Row-level history of financial records. The ledger itself is append-only and needs no audit.</p>
        </div>
        <button className="btn ghost sm" onClick={() => downloadCsv("audit.csv", rows ?? [])}>Export CSV</button>
      </div>
      <div className="toolbar">
        <select value={table} onChange={(e) => setTable(e.target.value)}>{TABLES.map((t) => <option key={t} value={t}>{t || "All tables"}</option>)}</select>
      </div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !rows.length ? <Empty>Nothing recorded yet.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>When</th><th>Table</th><th>Action</th><th>Row</th><th>Actor</th><th>Changed</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const changed = diff(r.old, r.new);
                  return (
                    <tr key={r.id} className="click" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                      <td className="w dim">{when(r.at)}</td>
                      <td>{r.table_name}</td>
                      <td><Tag tone={r.action === "DELETE" ? "bad" : r.action === "INSERT" ? "ok" : "info"}>{r.action}</Tag></td>
                      <td className="mono">{short(r.row_id)}</td>
                      <td className="mono">{short(r.actor) || "system"}</td>
                      <td className="dim">
                        {changed ? changed.join(", ") : r.action}
                        {openId === r.id && <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: "6px 0 0" }}>{JSON.stringify(r.action === "DELETE" ? r.old : r.new, null, 1)}</pre>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
