"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { I } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useLang, useT } from "@/lib/lang";

type Bubble = { who: "me" | "bot" | "think"; text: string; open?: { slug: string; title: string } | null };

/** Ask (brief §5.8): the concierge. Opening line scoped to the city, quick chips, action chips after every answer. */
function Ask() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const sp = useSearchParams();
  const [log, setLog] = useState<Bubble[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
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
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "concierge", q: msg, lang, city }) });
      const d = await r.json();
      setLog((l) => [...l.slice(0, -1), { who: "bot", text: d.text, open: d.open }]);
    } catch {
      setLog((l) => [...l.slice(0, -1), { who: "bot", text: t("noResults") }]);
    }
    setBusy(false);
  };

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
                {b.open && <Link href={`/e/${b.open.slug}`} className="red">{t("open")}: {b.open.title}</Link>}
                <button onClick={() => toast(t("waCont"))}>{t("onWa")}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="compose">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder={t("askPh")} />
        <button onClick={() => ask(q)} aria-label={t("send")} disabled={busy}><span style={{ width: 20, height: 20, display: "block" }}><I.send /></span></button>
      </div>
    </>
  );
}
export default function AskPage() {
  return <Suspense><Ask /></Suspense>;
}
