"use client";
import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { FeatureOff, useFeature, useBrand } from "@/components/Config";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { fmtDate } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

type L = { id: string; slug: string; title: string; title_ar: string | null; starts_at: string; kind: string; cover_url?: string | null; venues: { name: string; name_ar: string | null; city: string } | null };

/** Story card (brief §5.6): 9:16 preview, share to Story, 1080×1920 PNG generated on device. Everything is Story-ready. */
export default function StoryPage({ params }: { params: { slug: string } }) {
  const t = useT();
  const featureOn = useFeature("story");
  const brand = useBrand();
  const lang = useLang();
  const toast = useToast();
  const [l, setL] = useState<L | null>(null);
  const [ref, setRef] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!l?.cover_url) return;
    const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => setImg(im); im.src = l.cover_url;
  }, [l?.cover_url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    sb().from("events").select("id,slug,title,title_ar,starts_at,kind,cover_url,venues(name,name_ar,city)").eq("slug", params.slug).maybeSingle().then(({ data }) => setL(data as unknown as L | null));
    try { setRef(localStorage.getItem("wu-ref") ?? ""); } catch {}
  }, [params.slug]);
  if (!featureOn) return <FeatureOff back="/" />;
  if (!l) return <><TopBar back="/" title={t("story")} /><main><div className="empty">{t("loading")}</div></main></>;

  const title = lang === "ar" && l.title_ar ? l.title_ar : l.title;
  const venue = (lang === "ar" && l.venues?.name_ar) || l.venues?.name || "";
  const when = l.kind === "event" ? fmtDate(l.starts_at, lang) : venue ? l.venues?.city ?? "" : "";
  const link = `${brand.short_host}/${l.slug}${ref ? `?ref=${ref}` : ""}`;
  const words = title.split(" ");

  const render = (): HTMLCanvasElement => {
    // colours come from the active theme (globals.css tokens) so a white-label tenant's story matches its app
    const cs = getComputedStyle(document.documentElement);
    const tok = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    const RED = tok("--red", "#E24B4A"), RED_DARK = tok("--red-dark", "#A32D2D"), ON_RED = tok("--on-red", "#fff"), RED_LIGHT = tok("--cedar2", "#F06A66");
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1920;
    const x = c.getContext("2d")!;
    x.fillStyle = RED; x.fillRect(0, 0, 1080, 1920);
    if (img) {
      // the listing photo fills the top two thirds, with a gradient into the brand red so the type stays legible
      const r = Math.max(1080 / img.width, 1300 / img.height); const w = img.width * r, h = img.height * r;
      x.drawImage(img, (1080 - w) / 2, 0, w, h);
      const g = x.createLinearGradient(0, 300, 0, 1350); g.addColorStop(0, "rgba(0,0,0,0.15)"); g.addColorStop(0.55, "rgba(30,10,10,0.55)"); g.addColorStop(1, RED); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    }
    x.fillStyle = RED_DARK; x.globalAlpha = 0.9; x.beginPath(); x.moveTo(0, 1920); x.lineTo(0, 1400); x.lineTo(420, 1920); x.fill();
    x.fillStyle = RED_LIGHT; x.globalAlpha = 0.55; x.beginPath(); x.moveTo(760, 1300); x.lineTo(420, 1920); x.lineTo(1080, 1920); x.lineTo(1080, 1500); x.fill(); x.globalAlpha = 1;
    if (img) { x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = 24; }
    const font = (w: number, s: number) => `${w} ${s}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    x.fillStyle = img ? "#fff" : ON_RED; x.textAlign = lang === "ar" ? "right" : "left";
    const X = lang === "ar" ? 1010 : 70;
    x.font = font(300, 44); x.fillText(t("wm1"), X, 120);
    x.font = font(800, 92); x.fillText(t("country"), X, 205);
    x.font = font(800, 132);
    let line = "", y = 520;
    for (const w of words) { const test = line ? `${line} ${w}` : w; if (x.measureText(test).width > 940) { x.fillText(line, X, y); y += 140; line = w; } else line = test; }
    x.fillText(line, X, y);
    x.font = font(400, 54); x.fillText(when, X, y + 120); x.fillText(venue, X, y + 190);
    x.fillStyle = "#000"; x.beginPath(); (x as any).roundRect ? (x as any).roundRect(70, 1660, 940, 190, 28) : x.rect(70, 1660, 940, 190); x.fill();
    x.fillStyle = "#fff";
    for (let i = 0; i < 49; i++) if ((i * 7 + i * i + l.slug.length) % 3) x.fillRect(100 + (i % 7) * 20, 1680 + Math.floor(i / 7) * 20, 17, 17);
    x.textAlign = "left"; x.font = font(700, 52); x.fillText(`${t("open")} · ${brand.name}`, 280, 1740);
    x.font = font(400, 40); x.fillStyle = "#ccc"; x.fillText(link, 280, 1805);
    return c;
  };
  const download = () => {
    const a = document.createElement("a");
    a.download = `whatsup-story-${l.slug}.png`;
    a.href = render().toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
  };
  const share = async () => {
    const blob: Blob | null = await new Promise((res) => render().toBlob(res, "image/png"));
    if (blob && navigator.share && (navigator as any).canShare?.({ files: [new File([blob], "story.png", { type: "image/png" })] })) {
      try { await navigator.share({ files: [new File([blob], "story.png", { type: "image/png" })], title }); toast(t("shared")); return; } catch {}
    }
    toast(t("igOpen")); download();
  };

  return (
    <>
      <TopBar back={`/e/${l.slug}`} title={t("story")} />
      <main>
        <div className="story" style={l.cover_url ? { background: `linear-gradient(rgba(0,0,0,.15), rgba(30,10,10,.55) 55%, var(--red) 72%), center/cover url(${l.cover_url})`, textShadow: "0 2px 12px rgba(0,0,0,.5)" } : undefined}>
          <div style={{ position: "absolute", top: 14, insetInlineStart: 14, fontSize: 12 }}>😎 {brand.ig}</div>
          <div style={{ position: "absolute", top: 70, insetInline: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 0.98 }}>{words.slice(0, 3).join(" ")}{words.length > 3 ? <><br />{words.slice(3).join(" ")}</> : null}</div>
            <div style={{ fontSize: 12, marginTop: 12, opacity: 0.95 }}>{when}<br />{venue}</div>
          </div>
          <div style={{ position: "absolute", bottom: 14, insetInline: 14, background: "#000", borderRadius: 12, padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 44, height: 44, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "#000" }}>
              {Array.from({ length: 16 }, (_, i) => <i key={i} style={{ display: "block", background: (i * 7 + i * i + l.slug.length) % 3 ? "#fff" : "transparent" }} />)}
            </div>
            <div><div style={{ fontSize: 12, fontWeight: 600 }}>{t("open")}</div><div style={{ fontSize: 11, opacity: 0.7 }}>{link}</div></div>
          </div>
        </div>
        <div className="grid2">
          <button className="btn red" onClick={share}>{t("shareIg")}</button>
          <button className="btn line" onClick={download}>{t("dlStory")}</button>
        </div>
      </main>
    </>
  );
}
