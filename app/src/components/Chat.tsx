"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";
import { I } from "./Icons";

type Msg = { id: number; room_id: string; user_id: string; body: string; name: string; created_at?: string };
const COLORS = ["var(--g3)", "var(--g2)", "var(--g1)", "var(--ink3)", "var(--amber)"];
const colorOf = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

/** Realtime room (brief §5.9): avatars, messages, a translated line under Arabic messages when the UI is English, compose bar.
    Backed by chat_rooms / chat_messages through Supabase Realtime (postgres_changes). */
export default function Chat({ roomId, user, next, pinned, inline, canModerate, assistant }: { roomId: string; user: User | null; next: string; pinned?: string | null; inline?: boolean; canModerate?: boolean; assistant?: { text: string; cta: string; href: string } | null }) {
  const t = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [tr, setTr] = useState<Record<number, string>>({});
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof sb>["channel"]> | undefined;
    (async () => {
      const { data: m } = await sb().from("v_chat_messages").select("*").eq("room_id", roomId).order("id", { ascending: false }).limit(80);
      setMsgs(((m ?? []) as Msg[]).reverse());
      channel = sb()
        .channel(`room-${roomId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, async (payload: any) => {
          const { data: row } = await sb().from("v_chat_messages").select("*").eq("id", payload.new.id).maybeSingle();
          setMsgs((s) => (s.some((x) => x.id === payload.new.id) ? s : [...s, (row as Msg) ?? { ...payload.new, name: "…" }]));
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (payload: any) => setMsgs((s) => s.filter((x) => x.id !== payload.old.id)))
        .subscribe();
    })();
    return () => { if (channel) sb().removeChannel(channel); };
  }, [roomId]);
  const translate = async (m: Msg) => {
    if (tr[m.id]) return setTr((s) => { const c = { ...s }; delete c[m.id]; return c; });
    const to = document.documentElement.lang === "ar" ? "ar" : "en";
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "translate", text: m.body, to }) }).then((x) => x.json()).catch(() => null);
    setTr((s) => ({ ...s, [m.id]: r?.text ?? t("noTranslate") }));
  };
  const remove = async (m: Msg) => { const { error } = await sb().from("chat_messages").delete().eq("id", m.id); if (!error) setMsgs((s) => s.filter((x) => x.id !== m.id)); };
  useEffect(() => { if (inline) box.current?.scrollTo({ top: box.current.scrollHeight }); else window.scrollTo({ top: document.body.scrollHeight }); }, [msgs, inline]);

  const send = async () => {
    if (!text.trim() || !user) return;
    setErr("");
    const { error } = await sb().from("chat_messages").insert({ room_id: roomId, user_id: user.id, body: text.trim() });
    if (error) setErr(error.message); else setText("");
  };
  const isAr = (s: string) => /[؀-ۿ]/.test(s);

  const log = (
    <div className="chat" ref={box} style={inline ? { maxHeight: 280, overflowY: "auto", padding: "6px 0" } : undefined}>
      {assistant && (
        <div className="msg">
          <div className="av" style={{ background: "var(--g1)" }}>W</div>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 600 }}>WhatsUp</b> <span style={{ color: "var(--ink2)" }}>{assistant.text}</span>
            <div className="acts" style={{ marginTop: 6 }}><Link href={assistant.href} className="red">{assistant.cta}</Link></div>
          </div>
        </div>
      )}
      {!msgs.length && <div className="small">{t("chatEmpty")}</div>}
      {msgs.map((m) => {
        const foreign = (isAr(m.body) && document.documentElement.lang !== "ar") || (!isAr(m.body) && document.documentElement.lang === "ar" && /[a-z]{3,}/i.test(m.body));
        return (
          <div key={m.id} className="msg">
            <div className="av" style={{ background: m.user_id === user?.id ? "#000" : colorOf(m.user_id) }}>{(m.name || "?")[0].toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontWeight: 600 }}>{m.user_id === user?.id ? t("you") : m.name}</b> <span style={{ color: "var(--ink2)", wordBreak: "break-word" }}>{m.body}</span>
              {foreign && <button className="tr" onClick={() => translate(m)} style={{ background: "none", border: 0, padding: 0, display: "block", textAlign: "start" }}>{tr[m.id] ? tr[m.id] : t(isAr(m.body) ? "arabicMsg" : "englishMsg")}</button>}
            </div>
            {(canModerate || m.user_id === user?.id) && <button className="small" onClick={() => remove(m)} aria-label={t("remove")} style={{ color: "var(--ink3)", flex: "none" }}>✕</button>}
          </div>
        );
      })}
      {err && <div className="err" style={{ margin: "0 18px" }}>{err}</div>}
    </div>
  );
  const compose = user ? (
    <div className="compose" style={inline ? { position: "static", padding: "8px 0 0", borderTop: 0 } : undefined}>
      <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("chatPlaceholder")} />
      <button onClick={send} aria-label={t("send")}><span style={{ width: 20, height: 20, display: "block" }}><I.send /></span></button>
    </div>
  ) : (
    <div style={inline ? { paddingTop: 8 } : { padding: "8px 18px calc(80px + env(safe-area-inset-bottom))" }}><Link href={`/login?next=${encodeURIComponent(next)}`} className="btn line full">{t("signInChat")}</Link></div>
  );
  return (
    <>
      {pinned && <div className="pin" style={inline ? { margin: "8px 0" } : undefined}>📌 {pinned}</div>}
      {log}
      {compose}
    </>
  );
}
