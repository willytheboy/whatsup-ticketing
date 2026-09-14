"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { fmtDate, fmtDateTime, signed } from "@/lib/config";
import { useT } from "@/lib/lang";

type Partner = { id: string; name: string; kind: string };
type Balance = { net_balance: number; payable: number; receivable: number };
type Statement = { opening: number; closing: number; lines: any[]; by_stream: Record<string, number> };

/** Partner finance: ledger balance, statement for a period, settlements (payout requests) and invoices. */
export default function Finance() {
  const t = useT();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));

  useEffect(() => {
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return;
      const { data: p } = await sb().from("partners").select("id,name,kind").neq("kind", "platform").order("name");
      setPartners((p ?? []) as Partner[]);
      if (p?.length) setPartnerId(p[0].id);
    });
  }, []);

  const loadSettlements = async () => {
    const { data } = await sb().from("settlements").select("*").eq("partner_id", partnerId).order("period_end", { ascending: false });
    setSettlements(data ?? []);
  };

  useEffect(() => {
    if (!partnerId) return;
    (async () => {
      const [{ data: b }, { data: s }, { data: st }, { data: inv }] = await Promise.all([
        sb().from("v_partner_balances").select("*").eq("partner_id", partnerId).single(),
        sb().rpc("partner_statement", { p_partner: partnerId, p_start: from, p_end: to }),
        sb().from("settlements").select("*").eq("partner_id", partnerId).order("period_end", { ascending: false }),
        sb().from("invoices").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
      ]);
      setBalance(b as Balance);
      setStatement(s as Statement);
      setSettlements(st ?? []);
      setInvoices(inv ?? []);
    })();
  }, [partnerId, from, to]);

  const request = async (id: string) => {
    await sb().rpc("request_settlement", { p_id: id });
    loadSettlements();
  };

  return (
    <>
      <TopBar back="/org" title={t("finance")} />
      <main>
        {user === null && (
          <div className="card pad stack">
            <p style={{ margin: 0 }}>{t("signInOrg")}</p>
            <Link href="/login?next=/org/finance" className="btn green">{t("signIn")}</Link>
          </div>
        )}
        {user && !partners.length && <div className="empty">{t("noPartner")}</div>}
        {partners.length > 1 && (
          <div className="field">
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.kind}</option>)}
            </select>
          </div>
        )}
        {balance && (
          <>
            <div className="kpis three">
              <div className="kpi">
                <div className="label">{t("balance")}</div>
                <b className="num" style={{ color: Number(balance.net_balance) < 0 ? "var(--red)" : "var(--green)" }}>{signed(balance.net_balance)}</b>
              </div>
              <div className="kpi"><div className="label">{t("earnedK")}</div><b className="num">{signed(balance.payable)}</b></div>
              <div className="kpi"><div className="label">{t("cashHeld")}</div><b className="num">{signed(balance.receivable)}</b></div>
            </div>
            <p className="note" style={{ margin: 0 }}>{Number(balance.net_balance) >= 0 ? t("weOwe") : t("youOwe")}</p>
            <div className="card pad stack">
              <div className="row between">
                <b>{t("statement")}</b>
                <span className="note num">{fmtDate(from)} → {fmtDate(to)}</span>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div className="field" style={{ flex: 1 }}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              </div>
              <div className="lines">
                <div className="line"><span>{t("opening")}</span><span className="num">{signed(statement?.opening)}</span></div>
                {(statement?.lines ?? []).map((l: any) => (
                  <div key={l.line_id} className="line">
                    <span>
                      <span className="pill" style={{ marginInlineEnd: 6 }}>{l.kind.replace(/_/g, " ")}</span>
                      {l.journal_memo}
                      <div className="note">{fmtDateTime(l.posted_at)} · {l.memo}</div>
                    </span>
                    <span className="num" style={{ color: Number(l.amount) < 0 ? "var(--red)" : "var(--green)", whiteSpace: "nowrap" }}>
                      {Number(l.amount) > 0 ? "+" : ""}{signed(l.amount)}
                    </span>
                  </div>
                ))}
                <div className="line total"><span>{t("closing")}</span><span className="num">{signed(statement?.closing)}</span></div>
              </div>
              {statement?.by_stream && Object.keys(statement.by_stream).length > 0 && (
                <div className="note">{Object.entries(statement.by_stream).map(([k, v]) => `${k}: ${signed(v)}`).join(" · ")}</div>
              )}
            </div>
            <div className="card pad">
              <div className="label" style={{ marginBottom: 4 }}>{t("payouts")}</div>
              {settlements.length ? (
                settlements.map((s) => (
                  <div key={s.id} className="orow">
                    <div>
                      <b>{fmtDate(s.period_start)} → {fmtDate(s.period_end)}</b>
                      <small>{s.status}{s.reference ? ` · ${s.reference}` : ""}{s.paid_at ? ` · ${fmtDate(s.paid_at)}` : ""}</small>
                    </div>
                    <div style={{ textAlign: "end" }}>
                      <div className="num" style={{ fontWeight: 700 }}>{signed(s.amount)}</div>
                      {s.status === "scheduled" && Number(s.amount) > 0 && (
                        <button className="btn line sm" style={{ marginTop: 4 }} onClick={() => request(s.id)}>{t("requestPayout")}</button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="note">{t("firstPayout")}</div>
              )}
            </div>
            {invoices.length > 0 && (
              <div className="card pad">
                <div className="label" style={{ marginBottom: 4 }}>{t("invoices")}</div>
                {invoices.map((inv) => (
                  <div key={inv.id} className="orow">
                    <div>
                      <b>{inv.number}</b>
                      <small>
                        {inv.direction === "partner_to_platform" ? t("youPay") : t("wePay")} · {inv.status}
                        {inv.due_at ? ` · ${t("due")} ${fmtDate(inv.due_at)}` : ""}
                      </small>
                    </div>
                    <div className="num" style={{ fontWeight: 700 }}>{signed(inv.total)}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="note" style={{ textAlign: "center" }}>{t("ledgerNote")}</p>
          </>
        )}
      </main>
    </>
  );
}
