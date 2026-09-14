"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { money, signed } from "@/lib/config";
import { useAdmin } from "../../_lib";
import { useBrand } from "@/components/Config";
import { Empty } from "../../_ui";

type Row = Record<string, any>;
const ym = (d: Date) => d.toISOString().slice(0, 7);

/** Monthly board pack (next phase, item 6): one printable page — P&L, sales, top listings, partners, promotions, door, WhatsApp — for a month.
    Print it to PDF from the browser (Cmd/Ctrl-P); every number comes from the same views the back office uses. */
export default function BoardPack() {
  const admin = useAdmin();
  const brand = useBrand();
  const [month, setMonth] = useState(ym(new Date()));
  const [d, setD] = useState<any | null>(null);
  useEffect(() => {
    if (!admin.tenant) return;
    (async () => {
      const t = admin.tenant!.id;
      const start = `${month}-01`; const end = new Date(new Date(`${month}-01T00:00:00Z`).setUTCMonth(new Date(`${month}-01T00:00:00Z`).getUTCMonth() + 1)).toISOString().slice(0, 10);
      const prev = ym(new Date(new Date(`${month}-01T00:00:00Z`).setUTCMonth(new Date(`${month}-01T00:00:00Z`).getUTCMonth() - 1)));
      const [pnl, daily, orders, settlements, promos, events, scans, wa, users] = await Promise.all([
        sb().from("v_platform_pnl").select("*").eq("tenant_id", t).in("month", [`${month}-01`, `${prev}-01`]),
        sb().from("v_admin_daily").select("*").eq("tenant_id", t).gte("day", start).lt("day", end),
        sb().from("orders").select("event_id,total,face_total,payment_method,status,events(title)").eq("tenant_id", t).eq("status", "paid").gte("paid_at", start).lt("paid_at", end).limit(5000),
        sb().from("settlements").select("amount,status,partners(name,kind)").eq("tenant_id", t).gte("period_end", start).lt("period_end", end),
        sb().from("promotion_orders").select("package,price,status").eq("tenant_id", t).gte("created_at", start).lt("created_at", end),
        sb().from("events").select("id,title,kind,status").eq("tenant_id", t).gte("created_at", start).lt("created_at", end),
        sb().from("v_scan_alerts").select("*").limit(50),
        sb().from("wa_conversations").select("messages,cart,handoff").eq("tenant_id", t).gte("updated_at", start).lt("updated_at", end),
        sb().from("profiles").select("id", { count: "exact", head: true }).gte("created_at", start).lt("created_at", end),
      ]);
      const cell = (m: string, kind: string, stream?: string) => (pnl.data ?? []).filter((r: Row) => String(r.month).startsWith(m) && r.kind === kind && (stream ? r.stream === stream : true)).reduce((a: number, r: Row) => a + Number(r.amount), 0);
      const byEvent = new Map<string, { title: string; gross: number; orders: number }>();
      for (const o of (orders.data ?? []) as Row[]) { const k = o.event_id; const e = byEvent.get(k) ?? { title: o.events?.title ?? "—", gross: 0, orders: 0 }; e.gross += Number(o.face_total); e.orders += 1; byEvent.set(k, e); }
      const byMethod = new Map<string, number>();
      for (const o of (orders.data ?? []) as Row[]) byMethod.set(o.payment_method, (byMethod.get(o.payment_method) ?? 0) + Number(o.total));
      setD({
        month, prev,
        rev: { tickets: cell(month, "revenue", "tickets"), promotions: cell(month, "revenue", "promotions"), services: cell(month, "revenue", "services"), total: cell(month, "revenue"), expense: cell(month, "expense"), prevTotal: cell(prev, "revenue"), prevExpense: cell(prev, "expense") },
        sales: { orders: (daily.data ?? []).reduce((a: number, r: Row) => a + Number(r.orders), 0), face: (daily.data ?? []).reduce((a: number, r: Row) => a + Number(r.face_net), 0), collected: (daily.data ?? []).reduce((a: number, r: Row) => a + Number(r.collected), 0), cash: (daily.data ?? []).reduce((a: number, r: Row) => a + Number(r.cash_at_door), 0), bestDay: [...(daily.data ?? [])].sort((a: Row, b: Row) => Number(b.face_net) - Number(a.face_net))[0] },
        top: [...byEvent.values()].sort((a, b) => b.gross - a.gross).slice(0, 8),
        methods: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
        settlements: settlements.data ?? [],
        promos: promos.data ?? [],
        newListings: (events.data ?? []).length,
        dupes: (scans.data ?? []).reduce((a: number, r: Row) => a + Number(r.duplicates ?? 0), 0),
        wa: { conversations: (wa.data ?? []).length, messages: (wa.data ?? []).reduce((a: number, r: Row) => a + Number(r.messages ?? 0), 0), carts: (wa.data ?? []).filter((r: Row) => r.cart).length, handoffs: (wa.data ?? []).filter((r: Row) => r.handoff).length },
        newUsers: users.count ?? 0,
      });
    })();
  }, [admin.tenant, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (a: number, b: number) => (b ? `${a - b >= 0 ? "+" : ""}${Math.round(((a - b) / Math.abs(b)) * 100)}%` : "—");
  const title = new Date(`${month}-15T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <style>{`@media print { .bo-nav, .bo-top, .no-print { display: none !important } .bo-main { padding: 0 !important } .panel { break-inside: avoid } }`}</style>
      <div className="bo-head no-print"><div><h1>Board pack</h1><p className="sub">One page a month for the partners: revenue, sales, listings, partners, promotions, door and WhatsApp. Print to PDF from the browser.</p></div>
        <div className="row" style={{ gap: 8 }}><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><button className="btn green sm" onClick={() => window.print()}>Print / PDF</button></div></div>
      {!d ? <Empty>Loading…</Empty> : (
        <div style={{ maxWidth: 900 }}>
          <div className="panel"><div className="eyebrow">{brand.name} {brand.country} · board pack</div><h1 style={{ margin: "4px 0 0", fontSize: 28 }}>{title}</h1>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>Platform revenue <b>{money(d.rev.total)}</b> ({pct(d.rev.total, d.rev.prevTotal)} vs {d.prev}) on <b>{money(d.sales.face)}</b> of ticket sales across <b>{d.sales.orders}</b> paid orders; net result <b className={d.rev.total - d.rev.expense < 0 ? "neg" : "pos"}>{signed(d.rev.total - d.rev.expense)}</b>. {d.newListings} new listings, {d.newUsers} new accounts, {d.wa.conversations} WhatsApp conversations.</p></div>
          <div className="stats" style={{ marginTop: 12 }}>
            {[["Tickets revenue", d.rev.tickets], ["Promotions revenue", d.rev.promotions], ["Services revenue", d.rev.services], ["Expenses", d.rev.expense]].map(([l, v]) => <div key={String(l)} className="stat"><small>{l as string}</small><b>{money(Number(v))}</b></div>)}
          </div>
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat"><small>Collected</small><b>{money(d.sales.collected)}</b></div>
            <div className="stat"><small>Cash at the door</small><b>{money(d.sales.cash)}</b></div>
            <div className="stat"><small>Best day</small><b>{d.sales.bestDay ? `${d.sales.bestDay.day} · ${money(Number(d.sales.bestDay.face_net))}` : "—"}</b></div>
            <div className="stat"><small>Duplicate scans</small><b>{d.dupes}</b></div>
          </div>
          <section className="panel" style={{ marginTop: 12 }}><h2>Top listings</h2>
            {!d.top.length ? <Empty>No paid orders this month.</Empty> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Listing</th><th className="r">Orders</th><th className="r">Gross</th></tr></thead><tbody>{d.top.map((e: any, i: number) => <tr key={i}><td>{e.title}</td><td className="r">{e.orders}</td><td className="r">{money(e.gross)}</td></tr>)}</tbody></table></div>}
          </section>
          <div className="grid2" style={{ marginTop: 12 }}>
            <section className="panel"><h2>Payment methods</h2>{!d.methods.length ? <Empty>—</Empty> : <div className="tbl-wrap"><table className="tbl"><tbody>{d.methods.map(([m, v]: [string, number]) => <tr key={m}><td>{m}</td><td className="r">{money(v)}</td></tr>)}</tbody></table></div>}</section>
            <section className="panel"><h2>Partners settled</h2>{!d.settlements.length ? <Empty>No settlements closed this month.</Empty> : <div className="tbl-wrap"><table className="tbl"><tbody>{d.settlements.slice(0, 12).map((s: any, i: number) => <tr key={i}><td>{s.partners?.name}<div className="dim">{s.partners?.kind} · {s.status}</div></td><td className="r">{signed(Number(s.amount))}</td></tr>)}</tbody></table></div>}</section>
            <section className="panel"><h2>Promotions sold</h2>{!d.promos.length ? <Empty>None this month.</Empty> : <div className="tbl-wrap"><table className="tbl"><tbody>{Object.entries(d.promos.reduce((a: Record<string, [number, number]>, p: any) => { const k = p.package ?? "?"; a[k] = [(a[k]?.[0] ?? 0) + 1, (a[k]?.[1] ?? 0) + Number(p.price)]; return a; }, {})).map(([k, [n, amt]]: any) => <tr key={k}><td>{k} × {n}</td><td className="r">{money(amt)}</td></tr>)}</tbody></table></div>}</section>
            <section className="panel"><h2>WhatsApp concierge</h2><div className="tbl-wrap"><table className="tbl"><tbody><tr><td>Conversations</td><td className="r">{d.wa.conversations}</td></tr><tr><td>Messages</td><td className="r">{d.wa.messages}</td></tr><tr><td>Checkout links handed out</td><td className="r">{d.wa.carts}</td></tr><tr><td>Handed to a person</td><td className="r">{d.wa.handoffs}</td></tr></tbody></table></div></section>
          </div>
          <p className="dim" style={{ fontSize: 11, marginTop: 12 }}>Generated {new Date().toLocaleString("en-GB")} from the ledger (v_platform_pnl), paid orders (v_admin_daily), settlements, promotion orders, scan alerts and WhatsApp conversations. Amounts in {admin.tenant?.base_currency ?? "USD"}.</p>
        </div>
      )}
    </>
  );
}
