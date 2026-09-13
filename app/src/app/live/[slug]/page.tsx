"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

type Stream = {
  id: string; slug: string; title: string; title_ar: string | null; kind: string; source: string; status: string; access: string;
  pass_price: number; playback_url: string | null; description: string | null;
  venues: { name: string; name_ar: string | null; city: string } | null;
  events: { title: string; slug: string } | null;
};
type Msg = { id: number; room_id: string; user_id: string; body: string; name: string };

/** Player for HLS (via hls.js when the browser lacks native support), YouTube embeds, or plain media URLs. */
function Player({ s }: { s: Stream }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const t = useT();
  const [err, setErr] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el || !s.playback_url) return;
    if (s.source === "hls") {
      let hls: any;
      if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = s.playback_url;
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
      script.onload = () => {
        const Hls = (window as any).Hls;
        if (Hls?.isSupported()) {
          hls = new Hls();
          hls.loadSource(s.playback_url);
          hls.attachMedia(el);
          hls.on(Hls.Events.ERROR, (_: unknown, data: any) => data.fatal && setErr(t("streamError")));
        } else setErr(t("streamError"));
      };
      document.body.appendChild(script);
      return () => { hls?.destroy(); };
    }
    el.src = s.playback_url;
  }, [s.playback_url, s.source]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.playback_url) return <div className="empty" style={{ padding: 20 }}>{t("streamOffline")}</div>;
  if (s.source === "youtube") {
    const id = (s.playback_url.match(/(?:v=|be\/|live\/)([\w-]{6,})/) ?? [])[1];
    return (
      <div style={{ aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "#000" }}>
        <iframe src={`https://www.youtube.com/embed/${id ?? ""}?autoplay=1`} allow="autoplay; encrypted-media" allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} />
      </div>
    );
  }
  return (
    <div className="stack">
      {s.kind === "video" ? (
        <video ref={ref} controls autoPlay playsInline style={{ width: "100%", borderRadius: 12, background: "#000", aspectRatio: "16/9" }} />
      ) : (
        <audio ref={ref} controls autoPlay style={{ width: "100%" }} />
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

/** Realtime room chat backed by chat_rooms / chat_messages (postgres_changes). */
function Chat({ streamId, user }: { streamId: string; user: User | null }) {
  const t = useT();
  const [room, setRoom] = useState<{ id: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof sb>["channel"]> | undefined;
    (async () => {
      const { data: r } = await sb().from("chat_rooms").select("*").eq("scope", "stream").eq("ref_id", streamId).maybeSingle();
      setRoom(r);
      if (!r) return;
      const { data: m } = await sb().from("v_chat_messages").select("*").eq("room_id", r.id).order("id", { ascending: false }).limit(60);
      setMsgs(((m ?? []) as Msg[]).reverse());
      channel = sb()
        .channel(`room-${r.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${r.id}` }, async (payload: any) => {
          const { data: row } = await sb().from("v_chat_messages").select("*").eq("id", payload.new.id).maybeSingle();
          setMsgs((s) => [...s, (row as Msg) ?? { ...payload.new, name: "…" }]);
        })
        .subscribe();
    })();
    return () => { if (channel) sb().removeChannel(channel); };
  }, [streamId]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);

  const send = async () => {
    if (!text.trim() || !room || !user) return;
    setErr("");
    const { error } = await sb().from("chat_messages").insert({ room_id: room.id, user_id: user.id, body: text.trim() });
    if (error) setErr(error.message);
    else setText("");
  };

  if (!room) return null;
  return (
    <div className="card stack">
      <div className="row between">
        <b>{t("chatTitle")}</b>
        <span className="note">{msgs.length}</span>
      </div>
      <div ref={box} style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {msgs.length ? (
          msgs.map((m) => (
            <div key={m.id} style={{ fontSize: 14 }}>
              <b style={{ color: m.user_id === user?.id ? "var(--green)" : "var(--ink2)" }}>{m.name}</b> <span>{m.body}</span>
            </div>
          ))
        ) : (
          <div className="note">{t("chatEmpty")}</div>
        )}
      </div>
      {user ? (
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("chatPlaceholder")} />
          </div>
          <button className="btn green sm" onClick={send}>{t("send")}</button>
        </div>
      ) : (
        <Link href="/login" className="btn ghost">{t("signInChat")}</Link>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

export default function StreamPage({ params }: { params: { slug: string } }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Stream | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data } = await sb().from("v_streams").select("*, venues(name,name_ar,city), events(title,slug)").eq("slug", params.slug).maybeSingle();
    setS(data as unknown as Stream | null);
    setState(data ? "ok" : "none");
    if (data) {
      const { data: ok } = await sb().rpc("can_access_stream", { p_stream: data.id });
      setCanAccess(!!ok);
    }
  };
  useEffect(() => {
    sb().auth.getUser().then(({ data }) => setUser(data.user));
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [params.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading" || !s)
    return (
      <>
        <TopBar back="/live" title={state === "loading" ? "…" : t("liveTitle")} />
        <main><div className="empty">{state === "loading" ? t("loading") : t("notFound")}</div></main>
      </>
    );

  const title = lang === "ar" && s.title_ar ? s.title_ar : s.title;
  const venue = lang === "ar" && s.venues?.name_ar ? s.venues.name_ar : s.venues?.name;
  const buyPass = async () => {
    setBusy(true);
    setErr("");
    const { error } = await sb().rpc("buy_stream_pass", { p_stream: s.id, p_method: "card" });
    setBusy(false);
    if (error) return setErr(error.message);
    load();
  };

  return (
    <>
      <TopBar back="/live" title={title} />
      <main>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, background: "linear-gradient(135deg,#13201A,#1E7A3F)", color: "#fff" }}>
            <div className="row between">
              <span className={`pill ${s.status === "live" ? "live" : ""}`}>{s.status === "live" ? `● ${t("live")}` : t("offline")}</span>
              <span className="note" style={{ color: "rgba(255,255,255,.8)" }}>{t(s.kind === "video" ? "video" : "audio")}</span>
            </div>
            <h1 className="display" style={{ margin: "10px 0 2px", fontSize: 24, color: "#fff" }}>{title}</h1>
            <p style={{ margin: 0, opacity: 0.9 }}>{venue}{s.venues?.city ? ` · ${s.venues.city}` : ""}</p>
          </div>
          <div style={{ padding: 14 }}>
            {s.description && <p className="note" style={{ margin: "0 0 12px" }}>{s.description}</p>}
            {canAccess === null && <div className="note">{t("loading")}</div>}
            {canAccess === false && (
              <div className="stack">
                {s.access === "ticket_holders" && (
                  <p style={{ margin: 0 }}>
                    {t("holdersOnly")}
                    {s.events?.slug && (
                      <>
                        {" "}
                        <Link href={`/e/${s.events.slug}`} style={{ color: "var(--green)", fontWeight: 700 }}>{s.events.title} →</Link>
                      </>
                    )}
                  </p>
                )}
                {s.access === "pass" && (
                  <>
                    <p style={{ margin: 0 }}>{t("passSub")}</p>
                    {user ? (
                      <button className="btn primary" disabled={busy} onClick={buyPass}>
                        {busy ? t("processing") : `${t("buyPass")} · ${money(Number(s.pass_price))}`}
                      </button>
                    ) : (
                      <Link href={`/login?next=/live/${s.slug}`} className="btn green">{t("signIn")}</Link>
                    )}
                    <p className="note" style={{ margin: 0, textAlign: "center" }}>{t("sandbox")}</p>
                  </>
                )}
                {err && <div className="err">{err}</div>}
              </div>
            )}
            {canAccess && (s.status !== "live" ? <div className="empty" style={{ padding: 20 }}>{t("streamOffline")}</div> : <Player s={s} />)}
          </div>
        </div>
        {canAccess && <Chat streamId={s.id} user={user} />}
      </main>
    </>
  );
}
