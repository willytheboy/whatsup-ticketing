"use client";
import { Fragment, useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty, Stat, when } from "../_ui";

type Conv = { phone: string; user_id: string | null; lang: string; history: { who: string; text: string; at: string }[]; cart: any; handoff: boolean; messages: number; last_in_at: string | null; updated_at: string };

/** WhatsApp (v0.8): the conversations the concierge is having on the business number, the ones waiting for a person,
    and a box to try the assistant without a phone. The function runs in sandbox until WHATSAPP_TOKEN is set. */
export default function WhatsApp() {
  const admin = useAdmin();
  const [rows, setRows] = useState<Conv[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<{ mode: string; ai: boolean } | null>(null);
  const [testFrom, setTestFrom] = useState("96170000000");
  const [testText, setTestText] = useState("what's on friday under $30?");
  const [testLog, setTestLog] = useState<{ who: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!admin.tenant) return;
    const { data } = await sb().from("wa_conversations").select("*").eq("tenant_id", admin.tenant.id).order("updated_at", { ascending: false }).limit(200);
    setRows((data as Conv[]) ?? []);
  };
  useEffect(() => { load(); fetch(`${SUPABASE_URL}/functions/v1/wa-inbound`, { headers: { apikey: SUPABASE_ANON_KEY } }).then((r) => r.json()).then(setMode).catch(() => setMode(null)); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const release = async (phone: string) => { await sb().from("wa_conversations").update({ handoff: false, updated_at: new Date().toISOString() }).eq("phone", phone); load(); };
  const hold = async (phone: string) => { await sb().from("wa_conversations").update({ handoff: true, updated_at: new Date().toISOString() }).eq("phone", phone); load(); };
  const send = async () => {
    if (!testText.trim()) return;
    setBusy(true);
    const { data: { session } } = await sb().auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/wa-inbound`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ test: true, from: testFrom, text: testText }) }).then((x) => x.json()).catch(() => ({ error: "network" }));
    setTestLog((l) => [...l, { who: "user", text: testText }, { who: "bot", text: r.reply || (r.handoff ? "(waiting for a person — the bot stays quiet)" : r.error ? `error: ${r.error}` : "(no reply)") }]);
    setTestText(""); setBusy(false); load();
  };
  const list = (rows ?? []).filter((r) => filter === "all" || (filter === "handoff" ? r.handoff : filter === "cart" ? !!r.cart : true));
  const waiting = (rows ?? []).filter((r) => r.handoff).length;

  return (
    <>
      <div className="bo-head"><div><h1>WhatsApp</h1><p className="sub">The concierge on the business number: it answers from the live catalogue and hands people a one-tap checkout link. "Talk to a person" pauses the bot until you release it here.</p></div>
        <div className="row" style={{ gap: 8 }}>
          {mode && <Tag tone={mode.mode === "live" ? "ok" : "warn"}>{mode.mode === "live" ? "live" : "sandbox"}</Tag>}
          {mode && <Tag tone={mode.ai ? "ok" : undefined}>{mode.ai ? "Claude" : "rules"}</Tag>}
          <div className="seg">{["all", "handoff", "cart"].map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k === "handoff" ? "waiting for a person" : k === "cart" ? "with a cart" : "all"}</button>)}</div>
        </div>
      </div>
      <div className="stats">
        <Stat label="Conversations" value={(rows ?? []).length} />
        <Stat label="Waiting for a person" value={waiting} tone={waiting ? "warn" : undefined} />
        <Stat label="With a checkout link" value={(rows ?? []).filter((r) => r.cart).length} tone="good" />
        <Stat label="Messages" value={(rows ?? []).reduce((a, r) => a + (r.messages ?? 0), 0)} />
      </div>
      {mode?.mode !== "live" && <div className="note" style={{ marginBottom: 12 }}>Sandbox: replies are rendered and logged (Messages), not sent. Set <code>WHATSAPP_TOKEN</code>, <code>WHATSAPP_PHONE_ID</code>, <code>WHATSAPP_VERIFY_TOKEN</code> and <code>WHATSAPP_APP_SECRET</code> on the <code>wa-inbound</code> function and point the Meta webhook at <code>{SUPABASE_URL}/functions/v1/wa-inbound</code>. Add <code>ANTHROPIC_API_KEY</code> for Claude phrasing.</div>}

      <div className="grid3">
        <Panel title={`Conversations · ${list.length}`}>
          {rows === null ? <Empty>Loading…</Empty> : !list.length ? <Empty>No conversations yet.</Empty> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Number</th><th>Last message</th><th className="r">Msgs</th><th>State</th><th></th></tr></thead>
              <tbody>{list.map((r) => (
                <Fragment key={r.phone}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setOpen(open === r.phone ? null : r.phone)}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>+{r.phone}{r.user_id ? <Tag tone="info">member</Tag> : null}<div className="dim" style={{ fontSize: 11 }}>{r.lang} · {when(r.updated_at)}</div></td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[...(r.history ?? [])].reverse().find((h) => h.who === "user")?.text ?? "—"}</td>
                    <td className="r num">{r.messages}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.handoff ? <Tag tone="warn">person</Tag> : r.cart ? <Tag tone="ok">cart · {r.cart.qty} × {r.cart.name}</Tag> : <Tag>bot</Tag>}</td>
                    <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>{r.handoff ? <button className="btn green xs" onClick={() => release(r.phone)}>Release to bot</button> : <button className="btn ghost xs" onClick={() => hold(r.phone)}>Take over</button>}</td>
                  </tr>
                  {open === r.phone && (
                    <tr><td colSpan={5} style={{ background: "var(--sand)" }}>
                      {(r.history ?? []).map((h, i) => <div key={i} style={{ padding: "4px 0", fontSize: 13 }}><b>{h.who === "user" ? "them" : "bot"}</b> · <span className="dim">{when(h.at)}</span><div style={{ whiteSpace: "pre-wrap" }}>{h.text}</div></div>)}
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Try the concierge">
          <div className="field"><span className="label">From (digits)</span><input value={testFrom} onChange={(e) => setTestFrom(e.target.value)} /></div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, minHeight: 160, maxHeight: 360, overflowY: "auto", background: "#fff", margin: "10px 0", fontSize: 13 }}>
            {!testLog.length && <div className="dim">Ask like a fan would: "anything tonight in Batroun?", "2 tickets for the rooftop", "my tickets", "talk to a person".</div>}
            {testLog.map((m, i) => <div key={i} style={{ margin: "6px 0", textAlign: m.who === "user" ? "right" : "left" }}><span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 12, background: m.who === "user" ? "var(--g4)" : "var(--sand)", whiteSpace: "pre-wrap", maxWidth: "92%", textAlign: "left" }}>{m.text}</span></div>)}
          </div>
          <div className="row" style={{ gap: 8 }}><input value={testText} onChange={(e) => setTestText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ flex: 1 }} placeholder="Message…" /><button className="btn green sm" disabled={busy} onClick={send}>Send</button></div>
        </Panel>
      </div>
    </>
  );
}
