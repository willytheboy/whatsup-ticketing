"use client";
import { useEffect } from "react";
import { sb } from "@/lib/supabase-browser";

/** Route error boundary: reports to client_errors and offers a retry (brief §9: never a blank screen). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try { sb().from("client_errors").insert({ path: location.pathname, message: String(error.message).slice(0, 500), stack: String(error.stack ?? error.digest ?? "").slice(0, 2000), ua: navigator.userAgent.slice(0, 200) }).then(() => null); } catch {}
  }, [error]);
  return (
    <main style={{ padding: 18 }}>
      <div className="card pad stack" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28 }}>🪵</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Something broke on our side.</div>
        <div className="small">شي خرب عنّا. جرّب مرة تانية.</div>
        <button className="btn green" onClick={reset}>Try again · جرّب</button>
        <a className="btn line" href="/">Home</a>
      </div>
    </main>
  );
}
