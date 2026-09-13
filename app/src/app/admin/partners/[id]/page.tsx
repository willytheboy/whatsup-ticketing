"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { fmtDate, signed } from "@/lib/config";
import { daysAgo, today, short } from "../../_lib";
import { Stat, Panel, Tag, statusTone, Amount, Empty, when } from "../../_ui";

const FIELDS: [string, string][] = [["name", "Name"], ["name_ar", "Arabic name"], ["legal_name", "Legal name"], ["tax_id", "Tax ID"], ["email", "Email"], ["phone", "Phone"], ["address", "Address"], ["payout_method", "Payout method"]];

export default function PartnerDetail({ params }: { params: { id: string } }) {
  const [p, setP] = useState<any>(null);
  const [bal, setBal] = useState<any>(null);
  const [st, setSt] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [{ data: partner }, { data: b }, { data: s }, { data: m }, { data: se }, { data: inv }] = await Promise.all([
      sb().from("partners").select("*").eq("id", params.id).maybeSingle(),
      sb().from("v_partner_balances").select("*").eq("partner_id", params.id).maybeSingle(),
      sb().rpc("partner_statement", { p_partner: params.id, p_start: from, p_end: to }),
      sb().from("partner_members").select("user_id,role,profiles(name,email)").eq("partner_id", params.id),
      sb().from("settlements").select("*").eq("partner_id", params.id).order("period_end", { ascending: false }),
      sb().from("invoices").select("*").eq("partner_id", params.id).order("created_at", { ascending: false }),
    ]);
    setP(partner);
    setBal(b);
    setSt(s);
    setMembers(m ?? []);
    setSettlements(se ?? []);
    setInvoices(inv ?? []);
  };
  useEffect(() => { load(); }, [params.id, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setMsg("");
    const patch: any = {};
    for (const [k] of FIELDS) patch[k] = p[k] || null;
    patch.active = !!p.active;
    const { error } = await sb().from("partners").update(patch).eq("id", p.id);
    setMsg(error ? error.message : "Saved");
  };
  const addMember = async () => {
    setMsg("");
    const { data, error } = await sb().rpc("admin_add_partner_member", { p_partner: p.id, p_email: email, p_role: role });
    if (error) return setMsg(error.message);
    setMsg(data ? "Member added" : "No account with that email — ask them to sign in once first.");
    setEmail("");
    load();
  };
  const removeMember = async (uid: string) => {
    await sb().from("partner_members").delete().eq("partner_id", p.id).eq("user_id", uid);
    load();
  };

  if (!p) return <Empty>Loading…</Empty>;
  return (
    <>
      <div className="bo-head">
        <div>
          <Link href="/admin/partners" className="dim">← Partners</Link>
          <h1>{p.name} <Tag>{p.kind}</Tag></h1>
          <p className="sub">Partner id {short(p.id)} · created {when(p.created_at)}</p>
        </div>
      </div>
      <div className="stats">
        <Stat label="Net balance" value={<Amount v={bal?.net_balance} />} sub={Number(bal?.net_balance) >= 0 ? "WhatsUp owes the partner" : "partner owes WhatsUp"} />
        <Stat label="Payable (earned)" value={signed(bal?.payable)} />
        <Stat label="Receivable (cash held)" value={signed(bal?.receivable)} />
      </div>
      <div className="grid2">
        <Panel title="Details" action={<button className="btn green xs" onClick={save}>Save</button>}>
          <div className="form">
            {FIELDS.map(([k, label]) => (
              <div key={k} className="field"><span className="label">{label}</span><input value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></div>
            ))}
            <div className="field"><span className="label">Active</span><select value={p.active ? "1" : "0"} onChange={(e) => setP({ ...p, active: e.target.value === "1" })}><option value="1">active</option><option value="0">inactive</option></select></div>
          </div>
          {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
        </Panel>
        <Panel title="Portal members">
          <div className="dim" style={{ marginBottom: 8 }}>Members see this partner's statement in the app under Organiser → Finance.</div>
          {members.map((m) => (
            <div key={m.user_id} className="jline">
              <span>{m.profiles?.name ?? "—"}<div className="dim">{m.profiles?.email}</div></span>
              <Tag>{m.role}</Tag>
              <button className="btn ghost xs" onClick={() => removeMember(m.user_id)}>Remove</button>
            </div>
          ))}
          <div className="form" style={{ marginTop: 10 }}>
            <div className="field"><span className="label">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><span className="label">Role</span><select value={role} onChange={(e) => setRole(e.target.value)}><option>viewer</option><option>manager</option></select></div>
            <button className="btn ghost sm" disabled={!email} onClick={addMember}>Add member</button>
          </div>
        </Panel>
      </div>
      <Panel title="Statement" action={<div className="row"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>}>
        <div className="lines">
          <div className="line"><span>Opening balance</span><span className="num">{signed(st?.opening)}</span></div>
          {(st?.lines ?? []).map((l: any) => (
            <div key={l.line_id} className="line">
              <span><Tag>{l.kind.replace(/_/g, " ")}</Tag> {l.journal_memo}<div className="dim">{when(l.posted_at)} · {l.code}{l.memo ? ` · ${l.memo}` : ""}</div></span>
              <span className="num"><Amount v={l.amount} /></span>
            </div>
          ))}
          <div className="line total"><span>Closing balance</span><span className="num">{signed(st?.closing)}</span></div>
        </div>
      </Panel>
      <div className="grid2">
        <Panel title="Settlements">
          {settlements.length ? settlements.map((s) => (
            <div key={s.id} className="jline">
              <span>{fmtDate(s.period_start)} → {fmtDate(s.period_end)}<div className="dim">{s.reference ?? ""}{s.paid_at ? ` · paid ${fmtDate(s.paid_at)}` : ""}</div></span>
              <Tag tone={statusTone(s.status)}>{s.status}</Tag>
              <span className="r"><Amount v={s.amount} /></span>
            </div>
          )) : <Empty>No settlements yet.</Empty>}
        </Panel>
        <Panel title="Invoices">
          {invoices.length ? invoices.map((i) => (
            <div key={i.id} className="jline">
              <span><Link href={`/admin/invoices/${i.id}`}>{i.number}</Link><div className="dim">{i.direction === "partner_to_platform" ? "partner pays WhatsUp" : "WhatsUp pays partner"}{i.due_at ? ` · due ${fmtDate(i.due_at)}` : ""}</div></span>
              <Tag tone={statusTone(i.status)}>{i.status}</Tag>
              <span className="r">{signed(i.total)}</span>
            </div>
          )) : <Empty>No invoices.</Empty>}
        </Panel>
      </div>
    </>
  );
}
