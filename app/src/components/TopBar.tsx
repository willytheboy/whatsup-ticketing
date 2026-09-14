"use client";
import Link from "next/link";
import { useT } from "@/lib/lang";
import { I } from "./Icons";

/** Section header. With `back`: sticky chevron + title. Otherwise: eyebrow + optional sub, with the profile avatar at the end. */
export default function TopBar({ title, back, eyebrow, sub, right, avatar = true }: { title?: string; back?: string; eyebrow?: string; sub?: string; right?: React.ReactNode; avatar?: boolean }) {
  const t = useT();
  if (back) {
    return (
      <header className="top">
        <div className="top-row">
          <Link href={back} className="back" aria-label={t("back")}><span className="chev">‹</span><span>{title ?? t("back")}</span></Link>
          <span style={{ flex: 1 }} />
          {right}
        </div>
      </header>
    );
  }
  return (
    <div className="pad" style={{ paddingTop: 22, paddingBottom: 4 }}>
      <div className="row">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          {title && <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{title}</div>}
          {sub && <div className="meta" style={{ marginTop: 4, color: "var(--ink3)" }}>{sub}</div>}
        </div>
        <div className="row" style={{ gap: 6, flex: "none" }}>
          {right}
          {avatar && (
            <Link href="/profile" aria-label={t("profile")} style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--sand)", display: "grid", placeItems: "center", color: "var(--ink2)" }}>
              <span style={{ width: 20, height: 20, display: "block" }}><I.user /></span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
