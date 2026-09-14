"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { useBrand } from "@/components/Config";
import { sb } from "@/lib/supabase-browser";
import { allInKind, fmtDate, fmtTime, money, type OfferKind } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

type Ev = { id: string; slug: string; title: string; title_ar: string | null; kind: string; category: string; starts_at: string; description: string | null; cover_url: string | null; credit: string | null; venues: { name: string; name_ar: string | null; city: string } | null; tiers: { kind: OfferKind; face_price: number; capacity: number; sold: number; held: number }[] };
type Kit = { captions_en: string[]; captions_ar: string[]; broadcast_en: string; broadcast_ar: string; hashtags: string[]; ai: boolean };

/** Marketing kit (next phase, item 11 — promotional materials): captions, a WhatsApp broadcast, hashtags, and print-ready
    posters rendered on the device from the listing's own photo, price and QR. Everything here is copy-and-go for the venue. */
export default function KitPage({ params }: { params: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const router = useRouter();
  const brand = useBrand();
  const [ev, setEv] = useState<Ev | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const qr = useRef<HTMLDivElement>(null);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const link = ev ? `${origin}/e/${ev.slug}` : "";

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace(`/login?next=/org/kit/${params.id}`);
      const { data } = await sb().from("events").select("id,slug,title,title_ar,kind,category,starts_at,description,cover_url,credit,venues(name,name_ar,city),tiers(kind,face_price,capacity,sold,held)").eq("id", params.id).maybeSingle();
      setEv((data as unknown as Ev) ?? null);
    })();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ev?.cover_url) return;
    const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => setImg(im); im.src = ev.cover_url;
  }, [ev?.cover_url]);

  const from = ev ? Math.min(...ev.tiers.filter((x) => x.kind !== "pass" && x.capacity - x.sold - x.held > 0).map((x) => allInKind(x.kind, Number(x.face_price))), Infinity) : Infinity;
  const fromTxt = Number.isFinite(from) ? (from === 0 ? t("free") : `${t("from")} ${money(from)}`) : "";
  const title = ev ? (lang === "ar" && ev.title_ar ? ev.title_ar : ev.title) : "";
  const venue = ev ? ((lang === "ar" && ev.venues?.name_ar) || ev.venues?.name || "") : "";
  const when = ev ? (ev.kind === "event" ? `${fmtDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : t("openDaily")) : "";

  const write = async () => {
    if (!ev) return;
    setBusy(true);
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "kit", lang, listing: { title: ev.title, title_ar: ev.title_ar, kind: ev.kind, category: ev.category, when: ev.kind === "event" ? `${fmtDate(ev.starts_at, "en")} ${fmtTime(ev.starts_at, "en")}` : null, venue: ev.venues?.name, city: ev.venues?.city, from: Number.isFinite(from) ? money(from) : null, description: ev.description, link, brand: `${brand.name} ${brand.country}`, ig: brand.ig } }) }).then((x) => x.json()).catch(() => null);
    setKit(r); setBusy(false);
  };
  useEffect(() => { if (ev && !kit) write(); }, [ev]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); toast(t("copiedK")); } catch { toast(s.slice(0, 40)); } };
  const tok = (n: string, d: string) => (typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d : d);
  const qrImage = (): HTMLCanvasElement | null => qr.current?.querySelector("canvas") ?? null;

  /** A4 at 200 dpi (1654 × 2339): photo on top, wordmark, title, when/where, price, QR and link on a brand-coloured base. */
  const poster = (): HTMLCanvasElement => {
    const W = 1654, H = 2339;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d")!;
    const RED = tok("--red", "#E24B4A"), ON_RED = tok("--on-red", "#fff"), G1 = tok("--b1", "#3B6D11"), G2 = tok("--b2", "#639922"), G3 = tok("--b3", "#97C459"), CEDAR = tok("--cedar", "#A32D2D");
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    // photo (top 58 %) or facet band
    const ph = Math.round(H * 0.58);
    if (img) { const r = Math.max(W / img.width, ph / img.height); const w = img.width * r, h = img.height * r; x.drawImage(img, (W - w) / 2, (ph - h) / 2, w, h); }
    else { x.fillStyle = G2; x.fillRect(0, 0, W, ph); x.fillStyle = G1; x.beginPath(); x.moveTo(0, ph); x.lineTo(0, ph * 0.55); x.lineTo(W * 0.35, ph); x.fill(); x.fillStyle = G3; x.beginPath(); x.moveTo(W * 0.35, ph); x.lineTo(W * 0.62, ph * 0.3); x.lineTo(W, ph); x.fill(); x.fillStyle = CEDAR; x.beginPath(); x.moveTo(W * 0.86, ph); x.lineTo(W * 0.9, ph * 0.5); x.lineTo(W * 0.94, ph); x.fill(); }
    const g = x.createLinearGradient(0, ph * 0.35, 0, ph); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.72)"); x.fillStyle = g; x.fillRect(0, 0, W, ph);
    const font = (w: number, s: number) => `${w} ${s}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    const rtl = lang === "ar"; x.textAlign = rtl ? "right" : "left"; const X = rtl ? W - 90 : 90;
    x.fillStyle = "#fff"; x.font = font(300, 40); x.fillText(rtl ? brand.name_ar : brand.name.toUpperCase(), X, 110);
    x.font = font(800, 84); x.fillText(rtl ? brand.country_ar : brand.country, X, 195);
    // title wrapped over the photo's bottom
    x.font = font(800, 118); const words = title.split(" "); let line = "", y = ph - 240; const lines: string[] = [];
    for (const w of words) { const test = line ? `${line} ${w}` : w; if (x.measureText(test).width > W - 180 && line) { lines.push(line); line = w; } else line = test; }
    lines.push(line); y -= (lines.length - 1) * 125;
    x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = 20;
    for (const l of lines) { x.fillText(l, X, y); y += 125; }
    x.shadowBlur = 0;
    x.font = font(500, 54); x.fillText(`${when}${venue ? ` · ${venue}` : ""}`, X, ph - 70);
    // base: price, QR, link
    x.fillStyle = RED; x.fillRect(0, ph, W, H - ph);
    x.fillStyle = ON_RED;
    x.font = font(800, 96); x.fillText(fromTxt || t("ticketsOnWa"), X, ph + 190);
    x.font = font(400, 50); x.fillText(t("ticketsOnWa") + (rtl ? " · السعر شامل" : " · all-in pricing"), X, ph + 270);
    x.font = font(400, 46); x.fillText(rtl ? "كاش عالباب مقبول · بطاقة · Whish · OMT" : "Card · Whish · OMT · cash at the door", X, ph + 340);
    const q = qrImage(); const qs = 620; const qx = rtl ? 90 : W - 90 - qs, qy = H - 90 - qs;
    x.fillStyle = "#fff"; x.beginPath(); if ((x as any).roundRect) (x as any).roundRect(qx - 24, qy - 24, qs + 48, qs + 48, 36); else x.rect(qx - 24, qy - 24, qs + 48, qs + 48); x.fill();
    if (q) x.drawImage(q, qx, qy, qs, qs);
    x.fillStyle = ON_RED; x.textAlign = rtl ? "left" : "right"; x.font = font(700, 54); x.fillText(t("scanToBook"), rtl ? 90 + qs + 40 : W - 90 - qs - 40, H - 150);
    x.font = font(400, 40); x.fillText(link.replace(/^https?:\/\//, ""), rtl ? 90 + qs + 40 : W - 90 - qs - 40, H - 95);
    x.textAlign = rtl ? "right" : "left"; x.font = font(400, 34); x.globalAlpha = 0.8; x.fillText(`@${brand.ig}${ev?.credit ? ` · 📷 ${ev.credit.replace(/^Photo:\s*/i, "").split(" · ")[0]}` : ""}`, X, H - 40); x.globalAlpha = 1;
    return c;
  };
  /** 15 × 15 cm table tent / QR stand at 200 dpi (1181 px): title, "scan to book", QR, price. */
  const stand = (): HTMLCanvasElement => {
    const S = 1181; const c = document.createElement("canvas"); c.width = S; c.height = S; const x = c.getContext("2d")!;
    const RED = tok("--red", "#E24B4A"), ON_RED = tok("--on-red", "#fff"), G1 = tok("--g1", "#3B6D11");
    x.fillStyle = "#fff"; x.fillRect(0, 0, S, S);
    x.fillStyle = RED; x.fillRect(0, 0, S, 300);
    const font = (w: number, s: number) => `${w} ${s}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    x.fillStyle = ON_RED; x.textAlign = "center";
    x.font = font(300, 34); x.fillText(`${lang === "ar" ? brand.name_ar : brand.name.toUpperCase()} · ${lang === "ar" ? brand.country_ar : brand.country}`, S / 2, 80);
    x.font = font(800, 60); let tt = title; while (x.measureText(tt).width > S - 100 && tt.length > 8) tt = tt.slice(0, -2); if (tt !== title) tt += "…"; x.fillText(tt, S / 2, 170);
    x.font = font(500, 36); x.fillText(`${when}${venue ? ` · ${venue}` : ""}`.slice(0, 60), S / 2, 240);
    const q = qrImage(); const qs = 620; if (q) x.drawImage(q, (S - qs) / 2, 340, qs, qs);
    x.fillStyle = "#000"; x.font = font(800, 56); x.fillText(t("scanToBook"), S / 2, 1030);
    x.fillStyle = G1; x.font = font(600, 40); x.fillText(`${fromTxt ? `${fromTxt} · ` : ""}${t("ticketsOnWa")}`, S / 2, 1090);
    x.fillStyle = "#666"; x.font = font(400, 30); x.fillText(link.replace(/^https?:\/\//, ""), S / 2, 1145);
    return c;
  };
  const download = (c: HTMLCanvasElement, name: string) => { const a = document.createElement("a"); a.download = name; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove(); };

  if (!ev) return <><TopBar back="/org" title={t("kit")} /><main><div className="empty">{t("loading")}</div></main></>;
  const caps = lang === "ar" ? kit?.captions_ar : kit?.captions_en;
  const broadcast = lang === "ar" ? kit?.broadcast_ar : kit?.broadcast_en;

  return (
    <>
      <TopBar back={`/org/e/${ev.id}`} title={t("kit")} right={<Link href={`/org/promote/${ev.id}`} className="btn xs red">★ {t("promote")}</Link>} />
      <main className="stack">
        <div className="card pad">
          <div className="title" style={{ fontSize: 15 }}>{title}</div>
          <div className="meta">{when}{venue ? ` · ${venue}` : ""}{fromTxt ? ` · ${fromTxt}` : ""}</div>
          <p className="small" style={{ margin: "8px 0 0" }}>{t("kitSub")}</p>
        </div>

        <div ref={qr} hidden><QRCodeCanvas value={link} size={640} level="M" includeMargin /></div>

        <h2 style={{ margin: "4px 0 0" }}>{t("printKit")}</h2>
        <div className="card pad">
          <div className="grid2">
            <button className="btn green" onClick={() => download(poster(), `poster-${ev.slug}-${lang}.png`)}>🖨️ {t("posterA4")}</button>
            <button className="btn line" onClick={() => download(stand(), `qr-stand-${ev.slug}-${lang}.png`)}>▣ {t("qrStand")}</button>
          </div>
          <p className="small" style={{ margin: "8px 0 0" }}>{t("kitNote")}</p>
        </div>

        <div className="row between"><h2 style={{ margin: "4px 0 0" }}>{t("captions")}</h2><button className="btn xs line" disabled={busy} onClick={write}>{busy ? "…" : t("regenerate")}</button></div>
        {!kit && <div className="empty">{t("loading")}</div>}
        {(caps ?? []).map((c, i) => (
          <div key={i} className="card pad row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, fontSize: 14, whiteSpace: "pre-wrap" }}>{c}</div>
            <button className="btn xs line" onClick={() => copy(`${c}\n\n${(kit?.hashtags ?? []).map((h) => `#${h}`).join(" ")}`)}>{t("copy")}</button>
          </div>
        ))}
        {kit && <div className="card pad"><div className="eyebrow" style={{ marginBottom: 6 }}>{t("hashtags")}</div><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{kit.hashtags.map((h) => <span key={h} className="chip" style={{ cursor: "pointer" }} onClick={() => copy(`#${h}`)}>#{h}</span>)}</div></div>}

        {broadcast && (
          <>
            <h2 style={{ margin: "4px 0 0" }}>{t("broadcast")}</h2>
            <div className="card pad">
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{broadcast}</div>
              <div className="grid2" style={{ marginTop: 10 }}>
                <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(broadcast)}`} target="_blank" rel="noopener">{t("sendWaK")}</a>
                <button className="btn line" onClick={() => copy(broadcast)}>{t("copy")}</button>
              </div>
            </div>
          </>
        )}
        {kit && !kit.ai && <p className="small" style={{ textAlign: "center" }}>{lang === "ar" ? "نصوص من قوالب — مع مفتاح Claude بتصير مكتوبة عالإعلان." : "Template copy — with the Claude key set, it is written for this listing."}</p>}
      </main>
    </>
  );
}
