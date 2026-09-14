"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { I } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useLang, useT } from "@/lib/lang";
import { SUPPORT_WA, unitFee } from "@/lib/config";
import type { Cart } from "../e/[slug]/OfferPicker";

type CartHint = { slug: string; tier_id: string; name: string; qty: number; kind: string };
type Bubble = { who: "me" | "bot" | "think"; text: string; open?: { slug: string; title: string } | null; cart?: CartHint | null };

/** Ask (brief §5.8): the concierge. Opening line scoped to the city, quick chips, action chips after every answer. */
function Ask() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const sp = useSearchParams();
  const [log, setLog] = useState<Bubble[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const started = useRef(false);
  const router = useRouter();
  const city = typeof document !== "undefined" ? decodeURIComponent((document.cookie.match(/(?:^|; )city=([^;]*)/) ?? [])[1] ?? "") : "";

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const where = city || t("country");
    setLog([{ who: "bot", text: lang === "ar" ? `أهلا! شو بدك بـ${where} هالويكند؟` : `Ahla! What do you need in ${where} this weekend?` }]);
    const pre = sp.get("q");
    if (pre) ask(pre);
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo({ top: document.body.scrollHeight }); }, [log]);

  const ask = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setQ("");
    setBusy(true);
    setLog((l) => [...l, { who: "me", text: msg }, { who: "think", text: "…" }]);
    try {
      const history = log.filter((b) => b.who !== "think").slice(-6).map((b) => ({ who: b.who, text: b.text }));
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "concierge", q: msg, lang, city, history }) });
      const d = await r.json();
      setLog((l) => [...l.slice(0, -1), { who: "bot", text: d.text, open: d.open, cart: d.cart }]);
    } catch {
      setLog((l) => [...l.slice(0, -1), { who: "bot", text: t("noResults") }]);
    }
    setBusy(false);
  };

  const toCheckout = async (c: CartHint, title: string) => {
    // build the cart the listing page would have built, then go straight to checkout
    const r = await fetch(`/api/listing?slug=${encodeURIComponent(c.slug)}`).then((x) => x.json()).catch(() => null);
    const tier = r?.tiers?.find((x: any) => x.id === c.tier_id);
    if (!r || !tier) return router.push(`/e/${c.slug}`);
    const face = Number(tier.face_price);
    const cart: Cart = { listing: { id: r.id, slug: r.slug, title: r.title, kind: r.kind }, lines: [{ tier_id: tier.id, name: tier.name, kind: tier.kind, qty: c.qty, face, unit: face, fee: unitFee(tier.kind, face), covered: false, note: tier.note ?? null, plan_months: tier.plan_months ?? null }], table: null, gift: null, method: "card", checkin: null };
    sessionStorage.setItem("wu-cart", JSON.stringify(cart));
    router.push("/checkout");
  };
  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast(t("noMic"));
    const rec = new SR(); rec.lang = lang === "ar" ? "ar-LB" : "en-GB"; rec.interimResults = false;
    rec.onresult = (e: any) => { const s = e.results?.[0]?.[0]?.transcript; setListening(false); if (s) ask(s); };
    rec.onerror = () => setListening(false); rec.onend = () => setListening(false);
    setListening(true); rec.start();
  };
  const waLink = () => `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(log.filter((b) => b.who === "me").map((b) => b.text).slice(-3).join("\n") || t("askPh"))}`;

  return (
    <>
      <TopBar eyebrow={t("concierge")} sub={t("conciergeSub")} right={<span style={{ fontSize: 22 }}>😎</span>} avatar={false} />
      <div className="chat" style={{ paddingBottom: 150 }}>
        {log.map((b, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={b.who === "me" ? "me" : b.who === "think" ? "bot think" : "bot"}>{b.text}</div>
            {b.who === "bot" && i === 0 && (
              <div className="acts">
                {["q1", "q2", "q3"].map((k) => <button key={k} onClick={() => ask(t(k))}>{t(k)}</button>)}
              </div>
            )}
            {b.who === "bot" && i > 0 && (
              <div className="acts">
                {b.cart && <button className="red" onClick={() => toCheckout(b.cart!, b.open?.title ?? "")}>🛒 {t("checkout")} · {b.cart.qty} × {b.cart.name}</button>}
                {b.open && <Link href={`/e/${b.open.slug}`} className={b.cart ? "" : "red"}>{t("open")}: {b.open.title}</Link>}
                <a href={waLink()} target="_blank" rel="noopener" onClick={() => toast(t("waCont"))}>{t("onWa")}</a>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="compose">
        <button onClick={mic} aria-label={t("speak")} style={{ background: listening ? "var(--red)" : "var(--sand)", color: listening ? "#fff" : "var(--ink)" }}>🎤</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder={listening ? t("listening") : t("askPh")} />
        <button onClick={() => ask(q)} aria-label={t("send")} disabled={busy}><span style={{ width: 20, height: 20, display: "block" }}><I.send /></span></button>
      </div>
    </>
  );
}
export default function AskPage() {
  return <Suspense><Ask /></Suspense>;
}
