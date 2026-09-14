"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { money, signed } from "@/lib/config";
import { useAdmin, daysAgo, today, downloadCsv } from "../_lib";
import { Stat, Panel, Empty } from "../_ui";
import { forecast } from "@/lib/forecast";

type F30 = { runRate: number; pipeline: number; platform: number; events: number; basisDays: number };
/** 30-day revenue forecast (v0.7): run-rate from the last 14 days of paid orders plus the projected remaining sales of every live
    listing that starts within 30 days (same pace arithmetic organisers see). Plain sums, labelled as an estimate. */
function forecast30(last14: any[], events: any[], tiers: any[], buyerFeePct: number, orgFeePct: number): F30 {
  const days = Math.max(1, Math.min(14, last14.length));
  const gross14 = last14.reduce((a, r) => a + Number(r.face_net ?? 0), 0);
  const runRate = (gross14 / days) * 30;
  const horizon = Date.now() + 30 * 864e5;
  let pipeline = 0, n = 0;
  for (const e of events) {
    if (new Date(e.starts_at).getTime() > horizon) continue;
    const fc = forecast(e, tiers);
    if (!fc) continue;
    const mine = tiers.filter((x) => x.event_id === e.id && x.kind !== "pass");
    const sold = mine.reduce((a, x) => a + x.sold + x.held, 0);
    const avgFace = mine.reduce((a, x) => a + Number(x.face_price) * x.capacity, 0) / Math.max(1, mine.reduce((a, x) => a + x.capacity, 0));
    const extra = Math.max(0, fc.projected - sold) * avgFace;
    if (extra > 0) { pipeline += extra; n++; }
  }
  const gross = Math.max(runRate, pipeline);
  return { runRate, pipeline, platform: gross * (buyerFeePct + orgFeePct), events: n, basisDays: days };
}

export default function Reports() {
  const admin = useAdmin();
  const [pnl, setPnl] = useState<any[]>([]);
  const [daily, setDaily] = useState<any[]>([]);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [f30, setF30] = useState<F30 | null>(null);

  useEffect(() => {
    if (!admin.tenant) return;
    (async () => {
      const [{ data: last }, { data: evs }, { data: tenant }] = await Promise.all([
        sb().from("v_admin_daily").select("day,face_net").eq("tenant_id", admin.tenant!.id).gte("day", daysAgo(14)).order("day"),
        sb().from("events").select("id,title,kind,status,starts_at,created_at,tiers(id,event_id,capacity,sold,held,kind,name,face_price)").eq("tenant_id", admin.tenant!.id).in("status", ["live", "sold_out"]).gte("starts_at", new Date().toISOString()),
        sb().from("tenants").select("buyer_fee_pct,organiser_fee_pct").eq("id", admin.tenant!.id).maybeSingle(),
      ]);
      const tiers = (evs ?? []).flatMap((e: any) => e.tiers ?? []);
      setF30(forecast30(last ?? [], evs ?? [], tiers, Number(tenant?.buyer_fee_pct ?? 0.05), Number(tenant?.organiser_fee_pct ?? 0.03)));
    })();
  }, [admin.tenant]);

  useEffect(() => {
    if (!admin.tenant) return;
    (async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        sb().from("v_platform_pnl").select("*").eq("tenant_id", admin.tenant!.id).order("month", { ascending: false }),
        sb().from("v_admin_daily").select("*").eq("tenant_id", admin.tenant!.id).gte("day", from).lte("day", to).order("day", { ascending: false }),
      ]);
      setPnl(p ?? []);
      setDaily(d ?? []);
    })();
  }, [admin.tenant, from, to]);

  const months = Array.from(new Set(pnl.map((r) => r.month))).sort().reverse();
  const cell = (m: string, kind: string, stream?: string) =>
    pnl.filter((r) => r.month === m && r.kind === kind && (stream ? r.stream === stream : true)).reduce((a, r) => a + Number(r.amount), 0);
  const sum = (k: string) => daily.reduce((a, r) => a + Number(r[k] ?? 0), 0);

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Reports</h1>
          <p className="sub">Platform P&L from the ledger and daily sales from paid orders.</p>
        </div>
      </div>
      {f30 && (
        <Panel title="Next 30 days · forecast">
          <div className="stats">
            <Stat label="Gross ticket sales (est.)" value={money(Math.round(Math.max(f30.runRate, f30.pipeline)))} tone="good" sub={`run-rate ${money(Math.round(f30.runRate))} · pipeline ${money(Math.round(f30.pipeline))}`} />
            <Stat label="Platform revenue (est.)" value={money(Math.round(f30.platform))} sub="buyer fee + organiser fee" />
            <Stat label="Listings contributing" value={f30.events} sub="live, starting within 30 days" />
            <Stat label="Basis" value={`${f30.basisDays} days`} sub="paid orders, last 14 days" />
          </div>
          <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>Estimate, not a promise: the higher of the 14-day run-rate projected forward and the pace-based pipeline of every live listing starting in the next 30 days. The same arithmetic organisers see in their pricing tab.</p>
        </Panel>
      )}
      <Panel title="Platform P&L by month" action={<div className="row" style={{ gap: 6 }}><a className="btn ghost xs" href="/admin/reports/board">Board pack ↗</a><button className="btn ghost xs" onClick={() => downloadCsv("pnl.csv", pnl)}>Export CSV</button></div>}>
        {!months.length ? <Empty>No ledger activity yet.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Month</th><th className="r">Tickets rev</th><th className="r">Promotions rev</th><th className="r">Services rev</th><th className="r">Total revenue</th><th className="r">Expenses</th><th className="r">Net</th></tr></thead>
              <tbody>
                {months.map((m) => {
                  const rev = cell(m, "revenue");
                  const exp = cell(m, "expense");
                  return (
                    <tr key={m}>
                      <td className="w">{m.slice(0, 7)}</td>
                      <td className="r">{signed(cell(m, "revenue", "tickets"))}</td>
                      <td className="r">{signed(cell(m, "revenue", "promotions"))}</td>
                      <td className="r">{signed(cell(m, "revenue", "services"))}</td>
                      <td className="r"><b>{signed(rev)}</b></td>
                      <td className="r neg">{signed(exp)}</td>
                      <td className="r"><b className={rev - exp < 0 ? "neg" : "pos"}>{signed(rev - exp)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="toolbar">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn ghost sm" onClick={() => downloadCsv("daily.csv", daily)}>Export daily CSV</button>
      </div>
      <div className="stats">
        <Stat label="Paid orders" value={sum("orders")} />
        <Stat label="Face value (net of promos)" value={money(sum("face_net"))} />
        <Stat label="Platform revenue" value={money(sum("platform_rev"))} tone="good" />
        <Stat label="Collected" value={money(sum("collected"))} />
        <Stat label="Cash at door" value={money(sum("cash_at_door"))} />
      </div>
      <Panel title="Daily sales">
        {!daily.length ? <Empty>No paid orders in this range.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Day</th><th className="r">Orders</th><th className="r">Face net</th><th className="r">Platform rev</th><th className="r">Collected</th><th className="r">Cash at door</th></tr></thead>
              <tbody>
                {daily.map((r) => (
                  <tr key={r.day}><td className="w">{r.day}</td><td className="r">{r.orders}</td><td className="r">{money(Number(r.face_net))}</td><td className="r">{money(Number(r.platform_rev))}</td><td className="r">{money(Number(r.collected))}</td><td className="r">{money(Number(r.cash_at_door))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
