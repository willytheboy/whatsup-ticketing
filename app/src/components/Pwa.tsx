"use client";
import { useEffect } from "react";
import { sb } from "@/lib/supabase-browser";

/** Registers the service worker (offline wallet and door) and reports uncaught client errors to client_errors. */
export default function Pwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => null);
    const report = (message: string, stack?: string) => {
      try { sb().from("client_errors").insert({ path: location.pathname, message: String(message).slice(0, 500), stack: String(stack ?? "").slice(0, 2000), ua: navigator.userAgent.slice(0, 200) }).then(() => null); } catch {}
    };
    const onErr = (e: ErrorEvent) => report(e.message, e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => report(`unhandledrejection: ${e.reason?.message ?? e.reason}`, e.reason?.stack);
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
