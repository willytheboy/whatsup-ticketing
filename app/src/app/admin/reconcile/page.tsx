"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { money, fmtDate, signed } from "@/lib/config";
import { useAdmin, daysAgo, today, short } from "../_lib";
import { Panel, Tag, statusTone, Modal, Empty, when } from "../_ui";

/**
 * Provider reconciliation: import a payout statement from the card acquirer, Whish or OMT
 * (one transaction per line: ref, gross, fee, occurred_at[, order_id]) and match it against paid orders.
 */
export default function Reconcile() {
  const admin = useAdmin();
  const [batches, setBatches] = useState<any[] | null>(null);
  const [unrec, setUnrec] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [form, setForm] = useState({ provider: "card", external_ref: "", start: daysAgo(7), end: today(), notes: "", rows: "" });
  const [msg, setMsg] = useState("");
  const [resolve, setResolve] = useState<{ id: string; order: string; note: string } | null>(null);

  const load = async () => {
    if (!admin.tenant) return;
    const [{ data: b }, { data: u }] = await Promise.all([
      sb().from("provider_batches").select("*").eq("tenant_id", admin.tenant.id).order("created_at", { ascending: false }),
      sb().from("v_unreconciled_orders").select("*").eq("tenant_id", admin.tenant.id).order("paid_at", { ascending: false }).limit(100),
    ]);
    setBatches(b ?? []);
    setUnrec(u ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return setTxns([]);
    sb().from("provider_transactions").select("*").eq("batch_id", open.id).order("occurred_at").then(({ data }) => setTxns(data ?? []));
  }, [open]);

  const importBatch = async () => {
    setMsg("");
    const txnRows = form.rows.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [ref, gross, fee, at, order_id] = l.split(/[,;\t]/).map((x) => x.trim());
      return { ref, gross: Number(gross), fee: Number(fee || 0), at: at || null, order_id: order_id || null };
    });
    if (!txnRows.length || txnRows.some((t) => !t.ref || isNaN(t.gross))) return setMsg("Each line needs: reference, gross, fee, occurred_at (ISO), optional order id.");
    const { data, error } = await sb().rpc("import_provider_batch", {
      p_tenant: admin.tenant!.id, p_provider: form.provider, p_external_ref: form.external_ref || null, p_start: form.start, p_end: form.end, p_txns: txnRows, p_notes: form.notes || null,
    });
    if (error) return setMsg(error.message);
    setForm({ ...form, rows: "", external_ref: "", notes: "" });
    setMsg(`Batch ${short(data)} imported and reconciled.`);
    load();
  };

  const rerun = async (id: string) => {
    await sb().rpc("reconcile_batch", { p_batch: id });
    load();
    if (open?.id === id) {
      const { data } = await sb().from("provider_batches").select("*").eq("id", id).single();
      setOpen(data);
    }
  };
  const doResolve = async () => {
    if (!resolve) return;
    const { error } = await sb().rpc("resolve_transaction", { p_id: resolve.id, p_order: resolve.order || null, p_note: resolve.note });
    if (error) return setMsg(error.message);
    setResolve(null);
    if (open) rerun(open.id);
  };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Reconciliation</h1>
          <p className="sub">Match provider payouts (card acquirer, Whish, OMT) to paid orders. Matched batches post bank + fees to the ledger.</p>
        </div>
      </div>
      <div className="grid2">
        <Panel title="Import provider batch">
          <div className="form">
            <div className="field"><span className="label">Provider</span><select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}><option>card</option><option>whish</option><option>omt</option></select></div>
            <div className="field"><span className="label">Statement ref</span><input value={form.external_ref} onChange={(e) => setForm({ ...form, external_ref: e.target.value })} /></div>
            <div className="field"><span className="label">From</span><input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div className="field"><span className="label">To</span><input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <span className="label">Transactions — one per line: reference, gross, fee, occurred_at, order_id (optional)</span>
            <textarea rows={6} value={form.rows} onChange={(e) => setForm({ ...form, rows: e.target.value })} placeholder={"TXN-1001, 48.50, 1.21, 2026-09-13T15:57:43Z, 1e2a9032-ea2a-469a-843b-37a9e1b55bfb"} />
          </div>
          <div className="field" style={{ marginTop: 10 }}><span className="label">Notes</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
          <button className="btn green sm" style={{ marginTop: 10 }} onClick={importBatch}>Import and reconcile</button>
        </Panel>
        <Panel title={`Unreconciled paid orders (${unrec.length})`}>
          {unrec.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Order</th><th>Event</th><th>Method</th><th>Ref</th><th className="r">Total</th><th>Paid</th></tr></thead>
                <tbody>
                  {unrec.map((o) => (
                    <tr key={o.id}><td className="mono">{short(o.id)}</td><td>{o.title}</td><td>{o.payment_method}</td><td className="mono">{o.payment_ref ?? "—"}</td><td className="r">{money(Number(o.total))}</td><td className="w dim">{when(o.paid_at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Everything is reconciled.</Empty>
          )}
        </Panel>
      </div>
      <Panel title="Batches">
        {batches === null ? <Empty>Loading…</Empty> : !batches.length ? <Empty>No batches imported yet.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Provider</th><th>Ref</th><th>Period</th><th className="r">Gross</th><th className="r">Fees</th><th className="r">Net</th><th>Status</th><th>Summary</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="click" onClick={() => setOpen(b)}>
                    <td>{b.provider}</td>
                    <td className="mono">{b.external_ref ?? short(b.id)}</td>
                    <td className="w">{b.period_start ? `${fmtDate(b.period_start)} → ${fmtDate(b.period_end)}` : "—"}</td>
                    <td className="r">{signed(b.gross)}</td>
                    <td className="r">{signed(b.fees)}</td>
                    <td className="r"><b>{signed(b.net)}</b></td>
                    <td><Tag tone={statusTone(b.status)}>{b.status}</Tag></td>
                    <td className="dim">{b.summary ? `${b.summary.matched ?? 0} matched · ${b.summary.discrepancy ?? 0} disc · ${b.summary.unmatched ?? 0} unmatched · ${b.summary.missing_orders ?? 0} missing` : ""}</td>
                    <td><button className="btn ghost xs" onClick={(e) => { e.stopPropagation(); rerun(b.id); }}>Re-run</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {open && (
        <Modal title={`${open.provider} batch ${open.external_ref ?? short(open.id)}`} onClose={() => setOpen(null)}>
          <div className="dim"><Tag tone={statusTone(open.status)}>{open.status}</Tag> gross {signed(open.gross)} · fees {signed(open.fees)} · net {signed(open.net)}{open.journal_id ? ` · journal ${short(open.journal_id)}` : ""}</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Order</th><th className="r">Gross</th><th className="r">Fee</th><th>Status</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.external_ref}</td>
                    <td className="mono">{short(t.order_id)}</td>
                    <td className="r">{signed(t.gross)}</td>
                    <td className="r">{signed(t.fee)}</td>
                    <td><Tag tone={statusTone(t.status)}>{t.status}</Tag></td>
                    <td className="dim">{t.note}</td>
                    <td>{["pending", "discrepancy"].includes(t.status) && <button className="btn ghost xs" onClick={() => setResolve({ id: t.id, order: t.order_id ?? "", note: "" })}>Resolve</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resolve && (
            <div className="card stack">
              <div className="field"><span className="label">Order id (optional)</span><input value={resolve.order} onChange={(e) => setResolve({ ...resolve, order: e.target.value })} /></div>
              <div className="field"><span className="label">Resolution note</span><input value={resolve.note} onChange={(e) => setResolve({ ...resolve, note: e.target.value })} /></div>
              <div className="row"><button className="btn green sm" disabled={!resolve.note} onClick={doResolve}>Mark resolved</button><button className="btn ghost sm" onClick={() => setResolve(null)}>Cancel</button></div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
