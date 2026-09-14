"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/lang";

export type PlayableStream = { kind: string; source: string; playback_url: string | null };

/** Player for HLS (hls.js when the browser lacks native support), YouTube embeds, or plain media URLs. */
export default function Player({ s, autoPlay = true }: { s: PlayableStream; autoPlay?: boolean }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const t = useT();
  const [err, setErr] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el || !s.playback_url) return;
    if (s.source === "hls") {
      let hls: any;
      if (el.canPlayType("application/vnd.apple.mpegurl")) { el.src = s.playback_url; return; }
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
        <iframe src={`https://www.youtube.com/embed/${id ?? ""}?autoplay=${autoPlay ? 1 : 0}`} allow="autoplay; encrypted-media" allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} />
      </div>
    );
  }
  return (
    <div className="stack">
      {s.kind === "video" ? (
        <video ref={ref} controls autoPlay={autoPlay} playsInline style={{ width: "100%", borderRadius: 12, background: "#000", aspectRatio: "16/9" }} />
      ) : (
        <audio ref={ref} controls autoPlay={autoPlay} style={{ width: "100%" }} />
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
