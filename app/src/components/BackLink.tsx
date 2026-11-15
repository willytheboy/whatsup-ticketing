"use client";
import { useRouter } from "next/navigation";

/** Back arrow that returns to where the person came from inside the app (search results, a filtered feed),
    and to Home when the page was opened from outside (a shared link, WhatsApp, Instagram). */
export default function BackLink({ className, label, style, fallback = "/" }: { className?: string; label: string; style?: React.CSSProperties; fallback?: string }) {
  const router = useRouter();
  const go = () => {
    let inside = false;
    try { inside = Number(sessionStorage.getItem("wu-nav") ?? 0) > 1 && history.length > 1; } catch {}
    if (inside) router.back(); else router.push(fallback);
  };
  return <button type="button" className={className} aria-label={label} style={style} onClick={go}>‹</button>;
}
