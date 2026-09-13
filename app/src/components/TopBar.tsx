"use client";
import Link from "next/link";
import Logo from "./Logo";
import { useLang, useT, setLang } from "@/lib/lang";

function LangToggle() {
  const lang = useLang();
  return (
    <button className="pill" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label="Language">
      {lang === "ar" ? "EN" : "عربي"}
    </button>
  );
}

/** Sticky header. With `back` it shows a back arrow + title, otherwise the brand. */
export default function TopBar({ title, back }: { title?: string; back?: string }) {
  const lang = useLang();
  const t = useT();
  return (
    <header className="top">
      <div className="top-row">
        {back ? (
          <>
            <Link href={back} className="back" aria-label="Back">‹</Link>
            <div className="ttl">{title}</div>
          </>
        ) : (
          <Link href="/" className="brand">
            <span className="mark"><Logo /></span>
            <span>
              <span className="w1">{lang === "ar" ? "واتس أب" : "What's up"}</span>
              <span className="w2">{lang === "ar" ? "لبنان · تذاكر" : "Lebanon · Tickets"}</span>
            </span>
          </Link>
        )}
        <LangToggle />
        <Link href="/tickets" className="pill">{t("myTickets")}</Link>
      </div>
    </header>
  );
}
