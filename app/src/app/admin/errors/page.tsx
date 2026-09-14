"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin } from "../_lib";
import { Panel, Empty, when } from "../_ui";

/** Client errors reported by the app (window.onerror / unhandledrejection). */
export default function Errors() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { if (admin.isAdmin) sb().from("client_errors").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => setRows(data ?? [])); }, [admin.isAdmin]);
  const groups = new Map<string, any[]>();
  for (const r of rows ?? []) { const k = `${r.path} · ${r.message}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  return (
    <>
      <div className="bo-head"><div><h1>Errors</h1><p className="sub">Last 200 client errors, grouped by page and message.</p></div></div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No errors reported. 🎉</Empty> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th className="r">Count</th><th>Page</th><th>Message</th><th>Last seen</th><th>Browser</th></tr></thead>
            <tbody>{[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, rs]) => (
              <tr key={k}><td className="r"><b>{rs.length}</b></td><td className="mono">{rs[0].path}</td><td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis" }} title={rs[0].stack ?? ""}>{rs[0].message}</td><td className="w dim">{when(rs[0].created_at)}</td><td className="dim" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{rs[0].ua}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
