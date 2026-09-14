"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin, short } from "../_lib";
import { Panel, Tag, Empty, Stat, when } from "../_ui";

type Signal = { tenant_id: string; kind: string; event_id: string | null; event: string | null; ticket_id: string | null; buyer_id: string | null; n: number; amount: number | null; last_at: string; locked: boolean | null };
const KIND: Record<string, [string, string, "bad" | "warn" | "info"]> = {
  duplicate_scans: ["Duplicate scans", "One ticket scanned as a duplicate again and again — a screenshot doing the rounds, or a door device out of sync.", "bad"],
  order_burst: ["Order burst", "Four or more orders on one listing from one account in 24 hours — scalping, or a bot.", "warn"],
  serial_refunds: ["Serial refunds", "Three or more refunds in 90 days from one account.", "warn"],
  transfer_chain: ["Transfer chain", "A ticket that changed hands three or more times in a month.", "info"],
};

/** Fraud & door intelligence (v0.7): every signal the database can see, with the door lock as the one-tap action. */
export default function Fraud() {
  const admin = useAdmin();
  const [rows, setRows] = useState<Signal[] | null>(null);
  const [locks, setLocks] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");
  const load = async () => {
    if (!admin.tenant) return;
    const [{ data }, { data: l }] = await Promise.all([
      sb().from("v_fraud_signals").select("*").eq("tenant_id", admin.tenant.id).order("last_at", { ascending: false }).limit(300),
      sb().from("ticket_locks").select("ticket_id,reason,locked_at,tickets!inner(code,event_id,tenant_id,events(title))").is("released_at", null).eq("tickets.tenant_id", admin.tenant.id).order("locked_at", { ascending: false }),
    ]);
    setRows((data as Signal[]) ?? []); setLocks(l ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const release = async (ticketId: string) => { const { error } = await sb().rpc("release_ticket_lock", { p_ticket: ticketId }); setMsg(error ? error.message : "Released."); load(); };
  const lock = async (ticketId: string) => {
    const { error } = await sb().from("ticket_locks").upsert({ ticket_id: ticketId, reason: "manual", locked_at: new Date().toISOString(), released_at: null });
    setMsg(error ? error.message : "Locked — the door will refuse it until released."); load();
  };
  const list = (rows ?? []).filter((r) => filter === "all" || r.kind === filter);
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, (rows ?? []).filter((r) => r.kind === k).length]));

  return (
    <>
      <div className="bo-head"><div><h1>Fraud & door</h1><p className="sub">Signals from scans, orders, refunds and transfers over the last 30–90 days. The door itself freezes a ticket after three duplicate scans in ten minutes (Settings → Door lockout); everything else is a person's call.</p></div>
        <div className="seg">{["all", ...Object.keys(KIND)].map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k === "all" ? "all" : KIND[k][0].toLowerCase()}</button>)}</div></div>
      {msg && <div className="note" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="stats">
        {Object.entries(KIND).map(([k, [label, , tone]]) => <Stat key={k} label={label} value={counts[k] ?? 0} tone={counts[k] ? (tone === "bad" ? "bad" : "warn") : undefined} />)}
        <Stat label="Locked tickets" value={locks.length} tone={locks.length ? "bad" : undefined} />
      </div>
      <Panel title="Locked tickets">
        {!locks.length ? <Empty>No ticket is locked.</Empty> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Ticket</th><th>Listing</th><th>Reason</th><th>Since</th><th></th></tr></thead>
            <tbody>{locks.map((l: any) => (
              <tr key={l.ticket_id}><td className="mono">{l.tickets?.code}</td><td>{l.tickets?.events?.title ?? "—"}</td><td><Tag tone="bad">{l.reason}</Tag></td><td>{when(l.locked_at)}</td><td><button className="btn ghost xs" onClick={() => release(l.ticket_id)}>Release</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      <Panel title={`Signals · ${list.length}`}>
        {rows === null ? <Empty>Loading…</Empty> : !list.length ? <Empty>Nothing suspicious. Good.</Empty> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Signal</th><th>Listing</th><th>Who / what</th><th className="r">Count</th><th className="r">Amount</th><th>Last seen</th><th></th></tr></thead>
            <tbody>{list.map((r, i) => (
              <tr key={i}>
                <td><Tag tone={KIND[r.kind]?.[2]}>{KIND[r.kind]?.[0] ?? r.kind}</Tag><div className="dim" style={{ fontSize: 11, marginTop: 2, maxWidth: 260 }}>{KIND[r.kind]?.[1]}</div></td>
                <td>{r.event ?? "—"}</td>
                <td className="mono">{r.ticket_id ? `ticket ${short(r.ticket_id)}` : r.buyer_id ? `buyer ${short(r.buyer_id)}` : "—"}</td>
                <td className="r num">{r.n}</td>
                <td className="r num">{r.amount != null ? `$${Number(r.amount).toFixed(0)}` : "—"}</td>
                <td>{when(r.last_at)}</td>
                <td>{r.ticket_id ? (r.locked ? <button className="btn ghost xs" onClick={() => release(r.ticket_id!)}>Release</button> : <button className="btn xs" style={{ background: "var(--red)", color: "var(--on-red)" }} onClick={() => lock(r.ticket_id!)}>Lock at door</button>) : r.buyer_id ? <a className="btn ghost xs" href={`/admin/orders?q=${r.buyer_id}`}>Orders</a> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
