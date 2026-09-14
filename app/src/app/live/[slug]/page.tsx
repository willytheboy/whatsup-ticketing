"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import Band from "@/components/Band";
import Player from "@/components/Player";
import Chat from "@/components/Chat";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

type Stream = {
  id: string; slug: string; title: string; title_ar: string | null; kind: string; source: string; status: string; access: string;
  pass_price: number; playback_url: string | null; description: string | null; listeners: number;
  venues: { id: string; name: string; name_ar: string | null; city: string } | null;
  events: { title: string; slug: string } | null;
};

/** A venue station: player, pass purchase when the stream is paid, and its room (brief §5.7). */
export default function StreamPage({ params }: { params: { slug: string } }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Stream | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [listing, setListing] = useState<{ slug: string; title: string; title_ar: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data } = await sb().from("v_streams").select("*, venues(id,name,name_ar,city), events(title,slug)").eq("slug", params.slug).maybeSingle();
    setS(data as unknown as Stream | null);
    setState(data ? "ok" : "none");
    if (data) {
      const [{ data: ok }, { data: r }, { data: l }] = await Promise.all([
        sb().rpc("can_access_stream", { p_stream: data.id }),
        sb().from("chat_rooms").select("id").eq("scope", "stream").eq("ref_id", data.id).maybeSingle(),
        data.venues?.id ? sb().from("events").select("slug,title,title_ar").eq("venue_id", data.venues.id).in("status", ["live", "sold_out"]).order("starts_at").limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setCanAccess(!!ok);
      setRoom(r?.id ?? null);
      setListing((l as any) ?? null);
    }
  };
  useEffect(() => {
    sb().auth.getUser().then(({ data }) => setUser(data.user));
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [params.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading" || !s)
    return <><TopBar back="/radio" title={state === "loading" ? "…" : t("radio")} /><main><div className="empty">{state === "loading" ? t("loading") : t("notFound")}</div></main></>;

  const title = lang === "ar" && s.title_ar ? s.title_ar : s.title;
  const venue = lang === "ar" && s.venues?.name_ar ? s.venues.name_ar : s.venues?.name;
  const buyPass = async () => {
    setBusy(true); setErr("");
    const { error } = await sb().rpc("buy_stream_pass", { p_stream: s.id, p_method: "card" });
    setBusy(false);
    if (error) return setErr(error.message);
    load();
  };

  return (
    <>
      <TopBar back="/radio" title={title} right={s.status === "live" ? <span className="tag live">LIVE</span> : <span className="tag">{t("offline")}</span>} />
      <Band h={72} top={t("wm1")} main={t("radio")} />
      <main>
        <div>
          <div className="title" style={{ fontSize: 18 }}>{title}</div>
          <div className="meta">{venue}{s.venues?.city ? ` · ${s.venues.city}` : ""} · {t(s.kind === "video" ? "video" : "audio")} · {t("venueOwned")}{s.status === "live" ? ` · ${s.listeners} ${t("listeners")}` : ""}</div>
          {s.description && <p className="meta" style={{ marginTop: 6 }}>{s.description}</p>}
        </div>
        {canAccess === false && (
          <div className="card pad stack">
            {s.access === "ticket_holders" && (
              <p style={{ margin: 0, fontSize: 14 }}>{t("holdersOnly")} {s.events?.slug && <Link href={`/e/${s.events.slug}`} style={{ color: "var(--g1)", fontWeight: 600 }}>{s.events.title} →</Link>}</p>
            )}
            {s.access === "pass" && (
              <>
                <p style={{ margin: 0, fontSize: 14 }}>{t("passSub")}</p>
                {user ? <button className="btn red" disabled={busy} onClick={buyPass}>{busy ? t("processing") : `${t("buyPass")} · ${money(Number(s.pass_price))}`}</button>
                  : <Link href={`/login?next=/live/${s.slug}`} className="btn green">{t("signIn")}</Link>}
                <p className="small" style={{ margin: 0, textAlign: "center" }}>{t("sandbox")}</p>
              </>
            )}
            {err && <div className="err">{err}</div>}
          </div>
        )}
        {canAccess && (s.status !== "live" ? <div className="card pad"><div className="small">{t("streamOffline")}</div></div> : <Player s={s} />)}
        {listing && <Link href={`/e/${listing.slug}`} className="btn red full">{t("ticketsFor")} {lang === "ar" && listing.title_ar ? listing.title_ar : listing.title}</Link>}
        {canAccess && room && (
          <div className="card pad">
            <b style={{ fontSize: 14 }}>{t("chatTitle")}</b>
            <Chat roomId={room} user={user} next={`/live/${s.slug}`} inline />
          </div>
        )}
        <p className="small">{t("rightsNote")}</p>
      </main>
    </>
  );
}
