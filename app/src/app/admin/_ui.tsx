"use client";
import { fmtDateTime, signed } from "@/lib/config";

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Panel({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      {(title || action) && (
        <div className="row between" style={{ marginBottom: 10 }}>
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tag({ tone, children }: { tone?: "ok" | "bad" | "warn" | "info"; children: React.ReactNode }) {
  return <span className={`tag ${tone ?? ""}`}>{children}</span>;
}

/** Status → tag tone for orders, settlements, invoices, batches and streams. */
export function statusTone(s: string): "ok" | "bad" | "warn" | "info" | undefined {
  if (["paid", "matched", "resolved", "live", "issued"].includes(s)) return "ok";
  if (["refunded", "cancelled", "expired", "void", "failed", "discrepancy", "ended"].includes(s)) return "bad";
  if (["pending", "reserved", "requested", "processing", "scheduled", "draft"].includes(s)) return "warn";
  return undefined;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn ghost xs" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Amount({ v }: { v: number | string | null | undefined }) {
  const n = Number(v ?? 0);
  return <span className={n < 0 ? "neg" : n > 0 ? "pos" : ""}>{signed(n)}</span>;
}

/** Journal lines as rendered by v_admin_journals.lines */
export function JournalLines({ lines }: { lines: any[] }) {
  return (
    <div>
      {(lines ?? []).map((l, i) => (
        <div key={i} className="jline">
          <span>
            <span className="mono">{l.code}</span>
            {l.partner && <span className="dim"> · {l.partner}</span>}
            {l.memo && <div className="dim">{l.memo}</div>}
          </span>
          <span className="r">{Number(l.debit) ? `Dr ${signed(l.debit)}` : ""}</span>
          <span className="r">{Number(l.credit) ? `Cr ${signed(l.credit)}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

export const when = (iso: string | null | undefined) => (iso ? fmtDateTime(iso) : "—");

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty" style={{ padding: 24 }}>{children}</div>;
}
