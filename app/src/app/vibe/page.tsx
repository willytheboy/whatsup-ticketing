"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Facet } from "@/components/Band";
import { useToast } from "@/components/Toast";
import { useLang, useT } from "@/lib/lang";
import { startSynth, stopSynth } from "@/lib/synth";

const CHIPS: [string, string][] = [["Chill", "هادي"], ["Beach", "بحر"], ["Dinner", "عشا"], ["Mountains", "جبل"], ["Late", "متأخر"], ["Under $30", "تحت ٣٠$"]];
type Vibe = { name: string; line: string; bpm: number; plan: { slug: string; title: string }[] };

/** Vibe (brief §5.10): tell me the mood, get a track, a day → dinner → night, and a card to share. */
export default function VibePage() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const [mood, setMood] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set(["Beach"]));
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Vibe | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setMood(t("vibeDefault")); return () => stopSynth(); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const make = async () => {
    if (!mood.trim()) return toast(t("describe"));
    setBusy(true);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "vibe", mood, chips: [...sel], lang }) });
      const d = await r.json();
      setV(d);
      try { localStorage.setItem("wu-vibe", JSON.stringify({ name: d.name, line: d.line, bpm: d.bpm })); } catch {}
    } catch { toast(t("noResults")); }
    setBusy(false);
  };
  const play = () => { if (!v) return; if (playing) { stopSynth(); setPlaying(false); } else { startSynth(v.bpm); setPlaying(true); } };
  const first = v?.plan?.[2] ?? v?.plan?.[0];

  return (
    <>
      <TopBar eyebrow={t("vibe")} sub={t("vibeSub")} />
      <main style={{ paddingTop: 6 }}>
        <textarea className="vibe-in" rows={2} value={mood} onChange={(e) => setMood(e.target.value)} />
        <div className="chips flush">
          {CHIPS.map(([k, ar]) => (
            <button key={k} className={`chip ${sel.has(k) ? "on" : ""}`} onClick={() => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}>{lang === "ar" ? ar : k}</button>
          ))}
        </div>
        <button className="btn green full" onClick={make} disabled={busy}>{busy ? t("mixing") : t("makeVibe")}</button>
        {v && (
          <div className="card">
            <div className="band">
              <Facet h={80} />
              <div className="over" style={{ bottom: 10 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{v.name}</div></div>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <p className="meta" style={{ margin: "0 0 8px" }}>{v.line}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="play green sm" onClick={play} aria-label="Play">{playing ? "❚❚" : "▶"}</button>
                <div className="bar" style={{ flex: 1, margin: 0 }}><b style={{ width: playing ? "60%" : "30%" }} /></div>
                <span className="small">{t("aiTrack")}</span>
              </div>
              <div style={{ margin: "10px 0 8px", fontSize: 13 }}>
                {v.plan.map((p, i) => (
                  <div key={p.slug} className="row" style={{ padding: "6px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                    <span>{["☀️", "🍽️", "🌙"][i] ?? "•"} {p.title}</span>
                    <Link href={`/e/${p.slug}`} className="small" style={{ color: "var(--red-dark)", fontWeight: 600 }}>{t("open")}</Link>
                  </div>
                ))}
              </div>
              <div className="grid2">
                {first ? <Link href={`/e/${first.slug}`} className="btn red">{t("bookNight")}</Link> : <span />}
                <button className="btn line" onClick={() => { if (navigator.share) navigator.share({ title: v.name, text: `${v.name} — ${v.line}`, url: location.origin }).catch(() => {}); toast(t("vibeReady")); }}>{t("shareVibe")}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
