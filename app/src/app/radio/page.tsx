"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Band from "@/components/Band";
import Player from "@/components/Player";
import { sb } from "@/lib/supabase-browser";
import { FeatureOff, useFeature } from "@/components/Config";
import { useLang, useT } from "@/lib/lang";
import { startSynth, stopSynth } from "@/lib/synth";
import { tone } from "@/lib/config";

type Stream = {
  id: string; slug: string; title: string; title_ar: string | null; kind: string; source: string; status: string; access: string;
  pass_price: number; playback_url: string | null; description: string | null; listeners: number; venue_id: string | null; cover_url?: string | null;
  venues: { id: string; name: string; name_ar: string | null; city: string } | null;
};
type Vibe = { name: string; line: string; bpm?: number };

/** Radio (brief §5.7): station rail with LIVE badges, player, ticket CTA for the live venue, channel list with source and rights note.
    Venues stream their own music; the "Your vibe" station always plays a generated track. */
export default function RadioPage() {
  const t = useT();
  const featureOn = useFeature("radio");
  const lang = useLang();
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const [listing, setListing] = useState<{ slug: string; title: string; title_ar: string | null } | null>(null);
  const [vibe, setVibe] = useState<Vibe>({ name: "Salt and Oud", line: "Oud over a slow four-on-the-floor, waves under it.", bpm: 110 });
  const progT = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    sb().from("v_streams").select("*, venues(id,name,name_ar,city)").in("status", ["live", "offline"]).order("status").order("started_at", { ascending: false })
      .then(({ data }) => setStreams((data ?? []) as unknown as Stream[]));
    try { const v = JSON.parse(localStorage.getItem("wu-vibe") ?? "null"); if (v?.name) setVibe(v); } catch {}
    return () => { stopSynth(); clearInterval(progT.current); };
  }, []);

  const stations: (Stream | { id: "vibe"; title: string; status: "vibe" })[] = [...(streams ?? []), { id: "vibe", title: vibe.name, status: "vibe" }];
  const cur = stations[Math.min(idx, stations.length - 1)];
  const isVibe = cur?.id === "vibe";
  const st = isVibe ? null : (cur as Stream);

  useEffect(() => {
    // ticket CTA for the venue behind the current station
    if (!st?.venue_id) return setListing(null);
    sb().from("events").select("slug,title,title_ar").eq("venue_id", st.venue_id).in("status", ["live", "sold_out"]).order("starts_at").limit(1).maybeSingle().then(({ data }) => setListing((data as any) ?? null));
  }, [st?.venue_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!featureOn) return <FeatureOff back="/" />;

  const toggle = () => {
    const next = !playing;
    setPlaying(next);
    clearInterval(progT.current);
    if (next) {
      progT.current = setInterval(() => setProg((p) => (p + 1) % 100), 1000);
      if (isVibe) startSynth(vibe.bpm ?? 110);
    } else stopSynth();
  };
  const tune = (i: number) => {
    setIdx(i); setProg(0);
    stopSynth();
    if (stations[i].id === "vibe" && playing) startSynth(vibe.bpm ?? 110);
  };
  const name = (s: any) => (lang === "ar" && s?.title_ar ? s.title_ar : s?.title);

  return (
    <>
      <Band h={72} top={t("wm1")} main={t("radio")} />
      <div className="stations">
        {stations.map((s, i) => (
          <button key={s.id} className={`station ${idx === i ? "on" : ""}`} onClick={() => tune(i)}>
            <div className="art" style={{ background: s.id === "vibe" ? "var(--g3)" : (s as Stream).cover_url ? `center/cover url(${(s as Stream).cover_url})` : (s as Stream).status === "live" ? "var(--red)" : tone(s.id), position: "relative" }}>
              {s.id !== "vibe" && (s as Stream).status === "live" ? <span style={{ background: "var(--red)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 6 }}>LIVE</span> : s.id === "vibe" ? "✦" : ""}
            </div>
            <p>{s.id === "vibe" ? t("yourVibe") : name(s)}</p>
          </button>
        ))}
      </div>
      <div className="player">
        <button className={`play ${isVibe ? "green" : ""}`} onClick={toggle} aria-label="Play or pause">{playing ? "❚❚" : "▶"}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title" style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isVibe ? vibe.name : name(st)}</div>
          <div className="meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {isVibe ? `${t("aiTrack")} · ${vibe.line}` : `${(lang === "ar" && st?.venues?.name_ar) || st?.venues?.name || ""} · ${st?.status === "live" ? `${st.listeners} ${t("listeners")}` : t("offline")}`}
          </div>
          <div className="bar"><b style={{ width: `${playing ? prog : 0}%` }} /></div>
        </div>
      </div>
      <main style={{ paddingTop: 0 }}>
        {st && playing && st.status === "live" && st.access === "public" && <Player s={st} />}
        {st && playing && st.status === "live" && st.access !== "public" && <Link href={`/live/${st.slug}`} className="btn green full">{t("open")} · {name(st)}</Link>}
        {st && playing && st.status !== "live" && <div className="card pad"><div className="small">{t("streamOffline")}</div></div>}
        {listing && <Link href={`/e/${listing.slug}`} className="btn red full">{t("ticketsFor")} {name(listing)}</Link>}
        {isVibe && <Link href="/vibe" className="btn line full">✦ {t("makeVibe")}</Link>}
        <h2 style={{ margin: "4px 0 0" }}>{t("channels")}</h2>
        {streams === null && <div className="small">{t("loading")}</div>}
        {streams && !streams.length && <div className="small">{t("noStations")}</div>}
        {(streams ?? []).map((s) => (
          <Link key={s.id} href={`/live/${s.slug}`} className="card pad" style={{ display: "block" }}>
            <div className="row">
              <div style={{ minWidth: 0 }}>
                <div className="title" style={{ fontSize: 14 }}>{name(s)}</div>
                <div className="meta">{(lang === "ar" && s.venues?.name_ar) || s.venues?.name} · {t("venueOwned")}{s.description ? ` · ${s.description}` : ""}</div>
              </div>
              {s.status === "live" ? <span className="tag live">LIVE</span> : <span className="small">{t("offline")}</span>}
            </div>
          </Link>
        ))}
        <p className="small">{t("rightsNote")}</p>
      </main>
    </>
  );
}
