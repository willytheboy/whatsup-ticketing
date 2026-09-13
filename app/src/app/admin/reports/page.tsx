"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { money, signed } from "@/lib/config";
import { useAdmin, daysAgo, today, downloadCsv } from "../_lib";
import { Stat, Panel, Empty } from "../_ui";

export default function Reports() {
  const admin = useAdmin();
  const [pnl, setPnl] = useState<any[]>([]);
  const [daily, setDaily] = useState<any[]>([]);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

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
      <Panel title="Platform P&L by month" action={<button className="btn ghost xs" onClick={() => downloadCsv("pnl.csv", pnl)}>Export CSV</button>}>
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
