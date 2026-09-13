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

  useEffect(() => {
    if (!admin.tenant) return;
    const t = admin.tenant.id;
    (async () => {
      const [{ data: d }, { count: u }, { count: r }, { data: b }, { data: o }] = await Promise.all([
        sb().from("v_admin_daily").select("*").eq("tenant_id", t).gte("day", daysAgo(30)).order("day"),
        sb().from("v_unreconciled_orders").select("id", { count: "exact", head: true }).eq("tenant_id", t),
        sb().from("settlements").select("id", { count: "exact", head: true }).eq("tenant_id", t).in("status", ["requested", "processing"]),
        sb().from("v_partner_balances").select("*").eq("tenant_id", t).neq("kind", "platform").order("net_balance", { ascending: false }).limit(6),
        sb().from("v_admin_orders").select("*").eq("tenant_id", t).order("created_at", { ascending: false }).limit(8),
      ]);
      setDaily(d ?? []);
      setUnrec(u ?? 0);
      setRequested(r ?? 0);
      setBalances(b ?? []);
      setOrders(o ?? []);
    })();
  }, [admin.tenant]);

  const sum = (k: string) => daily.reduce((a, r) => a + Number(r[k] ?? 0), 0);
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
      </div>
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
