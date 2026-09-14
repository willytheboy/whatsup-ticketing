"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { money, fmtDate } from "@/lib/config";
import { useAdmin, daysAgo, short } from "./_lib";
import { Stat, Panel, Tag, statusTone, Amount, Empty, when } from "./_ui";

export default function Overview() {
  const admin = useAdmin();
  const [daily, setDaily] = useState<any[]>([]);
  const [unrec, setUnrec] = useState(0);
  const [requested, setRequested] = useState(0);
  const [balances, setBalances] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [refunds, setRefunds] = useState(0);
  const [sandboxMsgs, setSandboxMsgs] = useState(0);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ text: string; intent?: string } | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!admin.tenant) return;
    const t = admin.tenant.id;
    (async () => {
      const [{ data: d }, { count: u }, { count: r }, { data: b }, { data: o }, { data: al }, { count: rf }, { count: sm }] = await Promise.all([
        sb().from("v_admin_daily").select("*").eq("tenant_id", t).gte("day", daysAgo(30)).order("day"),
        sb().from("v_unreconciled_orders").select("id", { count: "exact", head: true }).eq("tenant_id", t),
        sb().from("settlements").select("id", { count: "exact", head: true }).eq("tenant_id", t).in("status", ["requested", "processing"]),
        sb().from("v_partner_balances").select("*").eq("tenant_id", t).neq("kind", "platform").order("net_balance", { ascending: false }).limit(6),
        sb().from("v_admin_orders").select("*").eq("tenant_id", t).order("created_at", { ascending: false }).limit(8),
        sb().from("v_scan_alerts").select("*").order("duplicates", { ascending: false }).limit(8),
        sb().from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("refund_status", "requested"),
        sb().from("message_log").select("id", { count: "exact", head: true }).eq("status", "sandbox").gte("created_at", daysAgo(7)),
      ]);
      setAlerts(al ?? []); setRefunds(rf ?? 0); setSandboxMsgs(sm ?? 0);
      setDaily(d ?? []);
      setUnrec(u ?? 0);
      setRequested(r ?? 0);
      setBalances(b ?? []);
      setOrders(o ?? []);
    })();
  }, [admin.tenant]);

  const sum = (k: string) => daily.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const ask = async () => {
    if (!q.trim()) return;
    setAsking(true);
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ledger", q }) }).then((x) => x.json()).catch(() => null);
    setAnswer(r ?? { text: "Could not answer." }); setAsking(false);
  };
  // anomaly flags: plain thresholds, explained in words
  const flags: { text: string; tone: "warn" | "bad" }[] = [];
  for (const a of alerts) if (Number(a.duplicates) >= 3) flags.push({ text: `${a.title}: ${a.duplicates} duplicate scans in 48h — screenshots being shared, or a double-scanning door`, tone: Number(a.duplicates) >= 10 ? "bad" : "warn" });
  for (const a of alerts) if (Number(a.invalid) >= 5) flags.push({ text: `${a.title}: ${a.invalid} invalid scans — wrong-event tickets or forged QRs at the door`, tone: "warn" });
  if (refunds >= 3) flags.push({ text: `${refunds} refund requests waiting on organisers`, tone: "warn" });
  if (unrec >= 10) flags.push({ text: `${unrec} unreconciled card/Whish/OMT orders — check the acquirer export`, tone: "warn" });
  if (daily.length >= 8) { const last = daily.slice(-1)[0], prev = daily.slice(-8, -1); const avg = prev.reduce((x, r) => x + Number(r.collected), 0) / Math.max(1, prev.length); if (avg > 50 && Number(last.collected) > avg * 3) flags.push({ text: `Yesterday collected ${money(Number(last.collected))}, 3× the weekly average — good day or a duplicate import?`, tone: "warn" }); }
  const last14 = daily.slice(-14);
  const max = Math.max(1, ...last14.map((r) => Number(r.collected)));

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">{admin.tenant?.name} · last 30 days</p>
        </div>
      </div>
      <div className="stats">
        <Stat label="Paid orders" value={sum("orders")} />
        <Stat label="Collected" value={money(sum("collected"))} sub="tickets + fees + deposits" />
        <Stat label="Platform revenue" value={money(sum("platform_rev"))} sub="buyer fee + organiser fee" tone="good" />
        <Stat label="Cash at door" value={money(sum("cash_at_door"))} sub="held by organisers" />
        <Stat label="Unreconciled" value={unrec} sub="card / Whish / OMT orders" tone={unrec ? "warn" : undefined} />
        <Stat label="Payout requests" value={requested} sub="settlements awaiting payment" tone={requested ? "warn" : undefined} />
        <Stat label="Refund requests" value={refunds} sub="waiting on organisers" tone={refunds ? "warn" : undefined} />
        <Stat label="Messages (sandbox)" value={sandboxMsgs} sub="last 7 days · WhatsApp not connected" tone={sandboxMsgs ? "warn" : undefined} />
      </div>
      {flags.length > 0 && (
        <Panel title="Flags">
          {flags.map((f, i) => <div key={i} className="row" style={{ padding: "6px 0", borderTop: i ? "1px solid var(--line)" : undefined }}><span style={{ fontSize: 13 }}>{f.text}</span><Tag tone={f.tone}>{f.tone === "bad" ? "look now" : "check"}</Tag></div>)}
        </Panel>
      )}
      <Panel title="Ask the ledger" action={<span className="dim" style={{ fontSize: 12 }}>revenue · top organisers · cash held · payouts due · refunds · promotions · no-shows · signups</span>}>
        <div className="row" style={{ gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="How much cash is held this week? Who are the top organisers this month?" style={{ flex: 1 }} />
          <button className="btn green sm" onClick={ask} disabled={asking}>{asking ? "…" : "Ask"}</button>
        </div>
        {answer && <div className="note" style={{ marginTop: 8, fontSize: 13 }}>{answer.intent ? <Tag tone="info">{answer.intent}</Tag> : null} {answer.text}</div>}
      </Panel>
      {alerts.length > 0 && (
        <Panel title="Door · last 48 hours">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Event</th><th className="r">Scans</th><th className="r">Duplicates</th><th className="r">Invalid</th><th>Last scan</th></tr></thead>
            <tbody>{alerts.map((a) => <tr key={a.event_id}><td>{a.title}</td><td className="r">{a.scans}</td><td className="r" style={Number(a.duplicates) ? { color: "var(--red-dark)", fontWeight: 600 } : undefined}>{a.duplicates}</td><td className="r">{a.invalid}</td><td className="w dim">{when(a.last_scan)}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      )}
      <div className="grid3">
        <Panel title="Collected per day">
          {last14.length ? (
            <div className="bars" style={{ marginBottom: 22 }}>
              {last14.map((r) => (
                <div key={r.day} style={{ height: `${Math.max(4, (Number(r.collected) / max) * 100)}%` }} title={`${r.day}: ${money(Number(r.collected))}`}>
                  <span>{fmtDate(r.day).slice(4)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No paid orders in the last 30 days.</Empty>
          )}
        </Panel>
        <Panel title="Partner balances" action={<Link href="/admin/partners" className="btn ghost xs">All partners</Link>}>
          {balances.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.partner_id} className="click" onClick={() => (location.href = `/admin/partners/${b.partner_id}`)}>
                      <td>
                        {b.name}
                        <div className="dim">{b.kind}</div>
                      </td>
                      <td className="r"><Amount v={b.net_balance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No partner activity yet.</Empty>
          )}
        </Panel>
      </div>
      <Panel title="Latest orders" action={<Link href="/admin/orders" className="btn ghost xs">All orders</Link>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Order</th><th>Event</th><th>Buyer</th><th>Method</th><th>Status</th><th className="r">Total</th><th>Created</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="click" onClick={() => (location.href = `/admin/orders?q=${o.id}`)}>
                  <td className="mono">{short(o.id)}</td>
                  <td>{o.event_title}</td>
                  <td>{o.buyer_name ?? o.buyer_email ?? "—"}</td>
                  <td>{o.payment_method}</td>
                  <td><Tag tone={statusTone(o.status)}>{o.status}</Tag></td>
                  <td className="r">{money(Number(o.total))}</td>
                  <td className="w dim">{when(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
