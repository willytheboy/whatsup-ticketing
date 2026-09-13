"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { fmtDate, signed } from "@/lib/config";
import { useAdmin } from "../../_lib";
import { Tag, statusTone, Empty } from "../../_ui";

/** Printable invoice (browser print → PDF). */
export default function InvoicePage({ params }: { params: { id: string } }) {
  const admin = useAdmin();
  const [inv, setInv] = useState<any>(null);
  useEffect(() => {
    sb().from("invoices").select("*, partners(*)").eq("id", params.id).maybeSingle().then(({ data }) => setInv(data));
  }, [params.id]);
  if (!inv) return <Empty>Loading…</Empty>;
  const lines: any[] = inv.lines ?? [];
  const platform = admin.tenant?.name ?? "WhatsUp";
  const from = inv.direction === "partner_to_platform" ? inv.partners : { name: platform };
  const to = inv.direction === "partner_to_platform" ? { name: platform } : inv.partners;
  return (
    <>
      <div className="bo-head no-print">
        <div>
          <Link href="/admin/invoices" className="dim">← Invoices</Link>
          <h1>{inv.number} <Tag tone={statusTone(inv.status)}>{inv.status}</Tag></h1>
        </div>
        <button className="btn green sm" onClick={() => window.print()}>Print / PDF</button>
      </div>
      <section className="panel" style={{ maxWidth: 820 }}>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="label">Invoice</div>
            <h2 style={{ fontSize: 22 }}>{inv.number}</h2>
            <div className="dim">Issued {inv.issued_at ? fmtDate(inv.issued_at) : "—"} · Due {inv.due_at ? fmtDate(inv.due_at) : "—"}</div>
            {inv.period_start && <div className="dim">Period {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}</div>}
          </div>
          <div style={{ textAlign: "end" }}>
            <div className="label">Total</div>
            <b style={{ fontSize: 26, fontFamily: "var(--font-display)" }}>{signed(inv.total)} {inv.currency}</b>
          </div>
        </div>
        <div className="grid2" style={{ marginTop: 16 }}>
          <div>
            <div className="label">From</div>
            <b>{from?.legal_name ?? from?.name}</b>
            <div className="dim">{[from?.address, from?.tax_id && `Tax ID ${from.tax_id}`, from?.email].filter(Boolean).join(" · ")}</div>
          </div>
          <div>
            <div className="label">Bill to</div>
            <b>{to?.legal_name ?? to?.name}</b>
            <div className="dim">{[to?.address, to?.tax_id && `Tax ID ${to.tax_id}`, to?.email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div className="tbl-wrap" style={{ marginTop: 16 }}>
          <table className="tbl">
            <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Unit</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}><td>{l.description}</td><td className="r">{l.qty}</td><td className="r">{signed(l.unit)}</td><td className="r">{signed(l.amount)}</td></tr>
              ))}
              <tr><td colSpan={3} className="r">Subtotal</td><td className="r">{signed(inv.subtotal)}</td></tr>
              {Number(inv.tax) > 0 && <tr><td colSpan={3} className="r">Tax ({inv.tax_pct}%)</td><td className="r">{signed(inv.tax)}</td></tr>}
              <tr><td colSpan={3} className="r"><b>Total</b></td><td className="r"><b>{signed(inv.total)} {inv.currency}</b></td></tr>
            </tbody>
          </table>
        </div>
        {inv.notes && <p className="dim" style={{ marginTop: 12 }}>{inv.notes}</p>}
        {inv.paid_at && <p className="dim">Paid {fmtDate(inv.paid_at)}{inv.payment_ref ? ` · ref ${inv.payment_ref}` : ""}</p>}
      </section>
    </>
  );
}
