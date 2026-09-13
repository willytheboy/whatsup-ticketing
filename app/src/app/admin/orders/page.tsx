"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useAdmin, short, downloadCsv } from "../_lib";
import { Panel, Tag, statusTone, Modal, Empty, when } from "../_ui";

const STATUSES = ["", "pending", "paid", "reserved", "cancelled", "refunded", "expired"];
const METHODS = ["", "card", "whish", "omt", "cash_door", "credit"];

function Orders() {
  const admin = useAdmin();
  const params = useSearchParams();
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState<any | null>(null);
  const [detail, setDetail] = useState<{ lines: any[]; tickets: any[] } | null>(null);
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    let query = sb().from("v_admin_orders").select("*").eq("tenant_id", admin.tenant.id).order("created_at", { ascending: false }).limit(300);
    if (status) query = query.eq("status", status);
    if (method) query = query.eq("payment_method", method);
    const { data } = await query;
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant, status, method]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return setDetail(null);
    (async () => {
      const [{ data: lines }, { data: tickets }] = await Promise.all([
        sb().from("order_lines").select("qty,unit_face,unit_fee,tiers(name),tables_vip(name)").eq("order_id", open.id),
        sb().from("tickets").select("code,state,seat,scanned_at").eq("order_id", open.id).order("code"),
      ]);
      setDetail({ lines: lines ?? [], tickets: tickets ?? [] });
    })();
  }, [open]);

  const act = async (action: string) => {
    setErr("");
    const { error } = await sb().rpc("admin_order_action", { p_order: open.id, p_action: action, p_ref: ref || null });
    if (error) return setErr(error.message);
    await load();
    const { data } = await sb().from("v_admin_orders").select("*").eq("id", open.id).single();
    setOpen(data);
  };

  const needle = q.trim().toLowerCase();
  const list = (rows ?? []).filter((o) =>
    !needle || [o.id, o.event_title, o.buyer_name, o.buyer_email, o.buyer_phone, o.payment_ref, o.promo_code].filter(Boolean).join(" ").toLowerCase().includes(needle),
  );

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Orders</h1>
          <p className="sub">Every checkout, reservation and refund. Actions post to the ledger automatically.</p>
        </div>
        <button className="btn ghost sm" onClick={() => downloadCsv("orders.csv", list)}>Export CSV</button>
      </div>
      <div className="toolbar">
        <input placeholder="Search id, event, buyer, reference…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}</select>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((s) => <option key={s} value={s}>{s || "All methods"}</option>)}</select>
      </div>
      <Panel>
        {rows === null ? (
          <Empty>Loading…</Empty>
        ) : !list.length ? (
          <Empty>No orders match.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Order</th><th>Event</th><th>Buyer</th><th>Method</th><th>Status</th><th className="r">Face</th><th className="r">Fees</th><th className="r">Total</th><th>Tickets</th><th>Ledger</th><th>Created</th></tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} className="click" onClick={() => setOpen(o)}>
                    <td className="mono">{short(o.id)}</td>
                    <td>{o.event_title}<div className="dim">{o.organiser_name}</div></td>
                    <td>{o.buyer_name ?? "—"}<div className="dim">{o.buyer_email ?? o.buyer_phone}</div></td>
                    <td>{o.payment_method}{o.payment_ref && <div className="dim mono">{o.payment_ref}</div>}</td>
                    <td><Tag tone={statusTone(o.status)}>{o.status}</Tag></td>
                    <td className="r">{money(Number(o.face_total))}</td>
                    <td className="r">{money(Number(o.buyer_fee) + Number(o.organiser_fee))}</td>
                    <td className="r"><b>{money(Number(o.total))}</b></td>
                    <td>{o.scanned_count}/{o.ticket_count}</td>
                    <td>{o.posted ? <Tag tone="ok">posted</Tag> : <Tag>—</Tag>} {o.reconciled ? <Tag tone="info">rec</Tag> : null}</td>
                    <td className="w dim">{when(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {open && (
        <Modal title={`Order ${short(open.id)}`} onClose={() => setOpen(null)}>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <Tag tone={statusTone(open.status)}>{open.status}</Tag>
            <Tag>{open.payment_method}</Tag>
            {open.promo_code && <Tag tone="info">promo {open.promo_code}</Tag>}
            {open.promoter_code && <Tag tone="info">promoter {open.promoter_code}</Tag>}
          </div>
          <div className="dim">{open.event_title} · {open.buyer_name ?? open.buyer_email} · {when(open.created_at)}{open.paid_at ? ` · paid ${when(open.paid_at)}` : ""}</div>
          <div className="lines">
            {(detail?.lines ?? []).map((l, i) => (
              <div key={i} className="line">
                <span>{l.qty} × {l.tiers?.name ?? l.tables_vip?.name}</span>
                <span className="num">{money(l.qty * Number(l.unit_face))}{Number(l.unit_fee) ? ` + ${money(l.qty * Number(l.unit_fee))} fee` : ""}</span>
              </div>
            ))}
            {Number(open.discount) > 0 && <div className="line"><span>Discount</span><span className="num">−{money(Number(open.discount))}</span></div>}
            {Number(open.table_deposit) > 0 && <div className="line"><span>Table deposit</span><span className="num">{money(Number(open.table_deposit))}</span></div>}
            <div className="line total"><span>Total</span><span className="num">{money(Number(open.total))}</span></div>
            <div className="dim">Organiser fee {money(Number(open.organiser_fee))} · processing {money(Number(open.processing_fee))}</div>
          </div>
          {detail?.tickets.length ? (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Tickets</div>
              {detail.tickets.map((t) => (
                <div key={t.code} className="jline">
                  <span className="mono">{t.code}{t.seat ? ` · ${t.seat}` : ""}</span>
                  <Tag tone={statusTone(t.state)}>{t.state}</Tag>
                  <span className="dim">{t.scanned_at ? when(t.scanned_at) : ""}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="field">
            <span className="label">Payment reference (optional)</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Provider reference / receipt no." />
          </div>
          {err && <div className="err">{err}</div>}
          <div className="row" style={{ flexWrap: "wrap" }}>
            {open.status === "reserved" && <button className="btn green sm" onClick={() => act("settle")}>Mark paid</button>}
            {open.status === "paid" && <button className="btn primary sm" onClick={() => confirm("Refund this order and void its tickets?") && act("refund")}>Refund</button>}
            {["pending", "reserved"].includes(open.status) && <button className="btn ghost sm" onClick={() => act("cancel")}>Cancel</button>}
            <button className="btn ghost sm" disabled={!ref} onClick={() => act("set_ref")}>Save reference</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
