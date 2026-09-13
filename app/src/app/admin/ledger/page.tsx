"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { signed } from "@/lib/config";
import { useAdmin, daysAgo, today, short, downloadCsv } from "../_lib";
import { Panel, Tag, Modal, JournalLines, Amount, Empty, when } from "../_ui";

const KINDS = ["", "sale", "refund", "promoter_commission", "revenue_share", "referral", "promotion", "service", "settlement", "provider_batch", "adjustment"];
type Line = { code: string; partner: string; debit: string; credit: string; memo: string };
const blank = (): Line => ({ code: "", partner: "", debit: "", credit: "", memo: "" });

export default function Ledger() {
  const admin = useAdmin();
  const [tab, setTab] = useState<"journals" | "accounts">("journals");
  const [journals, setJournals] = useState<any[] | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [openId, setOpenId] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    let q = sb().from("v_admin_journals").select("*").eq("tenant_id", admin.tenant.id).gte("posted_at", from).lte("posted_at", to + "T23:59:59Z").order("posted_at", { ascending: false }).limit(400);
    if (kind) q = q.eq("kind", kind);
    const [{ data: j }, { data: a }, { data: p }] = await Promise.all([
      q,
      sb().from("v_account_balances").select("*").eq("tenant_id", admin.tenant.id).order("code"),
      sb().from("partners").select("id,name,kind").eq("tenant_id", admin.tenant.id).order("name"),
    ]);
    setJournals(j ?? []);
    setAccounts(a ?? []);
    setPartners(p ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant, kind, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const reverse = async (id: string) => {
    const m = prompt("Reversal memo");
    if (m === null) return;
    const { error } = await sb().rpc("admin_reverse_journal", { p_journal: id, p_memo: m || "Reversal" });
    if (error) alert(error.message);
    else load();
  };

  const post = async () => {
    setErr("");
    const payload = lines.filter((l) => l.code.trim()).map((l) => ({ code: l.code.trim(), partner: l.partner || null, debit: Number(l.debit || 0), credit: Number(l.credit || 0), memo: l.memo || null }));
    const d = payload.reduce((a, l) => a + l.debit, 0);
    const c = payload.reduce((a, l) => a + l.credit, 0);
    if (Math.abs(d - c) > 0.005) return setErr(`Unbalanced: debits ${signed(d)} vs credits ${signed(c)}`);
    const { error } = await sb().rpc("post_adjustment", { p_tenant: admin.tenant!.id, p_memo: memo, p_lines: payload });
    if (error) return setErr(error.message);
    setAdjust(false);
    setMemo("");
    setLines([blank(), blank()]);
    load();
  };

  const open = journals?.find((j) => j.id === openId);

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Ledger</h1>
          <p className="sub">Double-entry, append-only. Every sale, share, settlement and adjustment is a balanced journal.</p>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={() => downloadCsv("journals.csv", (journals ?? []).map(({ lines, ...j }) => j))}>Export CSV</button>
          <button className="btn green sm" onClick={() => setAdjust(true)}>Post adjustment</button>
        </div>
      </div>
      <div className="seg" style={{ maxWidth: 320 }}>
        <button className={tab === "journals" ? "on" : ""} onClick={() => setTab("journals")}>Journals</button>
        <button className={tab === "accounts" ? "on" : ""} onClick={() => setTab("accounts")}>Account balances</button>
      </div>
      {tab === "journals" ? (
        <>
          <div className="toolbar">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k || "All kinds"}</option>)}</select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Panel>
            {journals === null ? (
              <Empty>Loading…</Empty>
            ) : !journals.length ? (
              <Empty>No journals in this range.</Empty>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Posted</th><th>Kind</th><th>Stream</th><th>Memo</th><th>Ref</th><th className="r">Amount</th><th></th></tr></thead>
                  <tbody>
                    {journals.map((j) => (
                      <tr key={j.id} className="click" onClick={() => setOpenId(j.id)}>
                        <td className="w dim">{when(j.posted_at)}</td>
                        <td><Tag tone={j.reversal_of ? "warn" : undefined}>{j.kind}</Tag></td>
                        <td>{j.stream ?? "—"}</td>
                        <td>{j.memo}{j.reversed && <span className="dim"> · reversed</span>}</td>
                        <td className="mono">{j.ref_type} {short(j.ref_id)}</td>
                        <td className="r">{signed(j.amount)}</td>
                        <td>{!j.reversed && !j.reversal_of && <button className="btn ghost xs" onClick={(e) => { e.stopPropagation(); reverse(j.id); }}>Reverse</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : (
        <Panel>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Name</th><th>Kind</th><th className="r">Debits</th><th className="r">Credits</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.account_id}>
                    <td className="mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td><Tag>{a.kind}</Tag></td>
                    <td className="r">{signed(a.debits)}</td>
                    <td className="r">{signed(a.credits)}</td>
                    <td className="r"><Amount v={a.balance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {open && (
        <Modal title={`${open.kind} · ${short(open.id)}`} onClose={() => setOpenId(null)}>
          <div className="dim">{when(open.posted_at)} · {open.memo}{open.reversal_of ? ` · reversal of ${short(open.reversal_of)}` : ""}</div>
          <JournalLines lines={open.lines} />
          {open.meta && Object.keys(open.meta).length > 0 && <pre className="dim" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(open.meta, null, 1)}</pre>}
        </Modal>
      )}
      {adjust && (
        <Modal title="Post adjustment" onClose={() => setAdjust(false)}>
          <div className="field"><span className="label">Memo (required)</span><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Why this entry exists" /></div>
          <div className="dim">Account codes: clearing:card, clearing:whish, clearing:omt, bank, payable:&lt;partner&gt;, receivable:&lt;partner&gt;, rev:tickets, rev:promotions, rev:services, processing_recovery, processing_expense, revenue_share, referral_marketing, buyer_credit. Choosing a partner fills payable:&lt;partner&gt;.</div>
          {lines.map((l, i) => (
            <div key={i} className="form">
              <div className="field"><span className="label">Code</span><input value={l.code} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} placeholder="rev:tickets" /></div>
              <div className="field">
                <span className="label">Partner</span>
                <select value={l.partner} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, partner: e.target.value, code: e.target.value ? `payable:${e.target.value}` : x.code } : x)))}>
                  <option value="">—</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field"><span className="label">Debit</span><input inputMode="decimal" value={l.debit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, debit: e.target.value } : x)))} /></div>
              <div className="field"><span className="label">Credit</span><input inputMode="decimal" value={l.credit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)))} /></div>
              <div className="field"><span className="label">Memo</span><input value={l.memo} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))} /></div>
            </div>
          ))}
          <button className="btn ghost xs" onClick={() => setLines([...lines, blank()])}>+ line</button>
          {err && <div className="err">{err}</div>}
          <button className="btn green sm" disabled={!memo.trim()} onClick={post}>Post journal</button>
        </Modal>
      )}
    </>
  );
}
