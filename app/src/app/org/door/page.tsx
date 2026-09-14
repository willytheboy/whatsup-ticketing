"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

type Ev = { event_id: string; title: string; sold: number; checked_in: number };
type Scan = { result: string; code?: string; reason?: string; tier?: string; holder?: string; seat?: string; at?: string };

/** Door check-in: camera QR scanning via BarcodeDetector, or paste the WU1 token. Each scan calls the `scan` edge function. */
export default function DoorScanner() {
  const t = useT();
  const [events, setEvents] = useState<Ev[]>([]);
  const [eventId, setEventId] = useState("");
  const [result, setResult] = useState<Scan | null>(null);
  const [token, setToken] = useState("");
  const [cam, setCam] = useState<"idle" | "on" | "unsupported">("idle");
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [recent, setRecent] = useState<Scan[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return;
      const { data: ev } = await sb().from("organiser_event_stats").select("event_id,title,sold,checked_in").order("starts_at");
      setEvents((ev ?? []) as Ev[]);
      if (ev?.[0]) setEventId(ev[0].event_id);
    });
  }, []);

  const check = async (tok: string) => {
    if (busy.current || !eventId) return;
    busy.current = true;
    const { data, error } = await sb().functions.invoke("scan", { body: { token: tok, event_id: eventId, device_id: "web-" + navigator.userAgent.slice(0, 20) } });
    const r: Scan = data ?? { result: "invalid", reason: error?.message };
    setResult(r);
    setRecent((s) => [{ ...r, at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }, ...s].slice(0, 20));
    if (r.result === "valid" && navigator.vibrate) navigator.vibrate(80);
    setTimeout(() => { setResult(null); busy.current = false; }, 2200);
  };

  const startCam = async () => {
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) return setCam("unsupported");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    if (video.current) {
      video.current.srcObject = stream;
      await video.current.play();
    }
    setCam("on");
    const detector = new Detector({ formats: ["qr_code"] });
    const tick = async () => {
      if (!video.current?.srcObject) return;
      try {
        const codes = await detector.detect(video.current);
        if (codes[0]?.rawValue) await check(codes[0].rawValue);
      } catch {}
      requestAnimationFrame(() => setTimeout(tick, 250));
    };
    tick();
  };

  const tone = result ? (result.result === "valid" ? "ok" : result.result === "duplicate" ? "dup" : "bad") : "";

  return (
    <>
      <TopBar back="/profile" title={t("doorMode")} />
      <main>
        <div className="meta" style={{ marginTop: -4 }}>{t("doorSub")}</div>
        {events.length > 0 && (
          <div className="field">
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {events.map((e) => <option key={e.event_id} value={e.event_id}>{e.title}</option>)}
            </select>
          </div>
        )}
        {user === null && (
          <div className="card pad stack">
            <p style={{ margin: 0 }}>{t("signInDoor")}</p>
            <Link href="/login?next=/org/door" className="btn green">{t("signIn")}</Link>
          </div>
        )}
        {user && (
          <>
            <div className="scanbox">
              <video ref={video} muted playsInline />
              <div className="frame" />
              {cam !== "on" && <span className="small" style={{ color: "#fff", position: "absolute" }}>{t("camMsg")}</span>}
            </div>
            {result && (
              <div className={`result ${tone}`}>
                {t(result.result === "valid" ? "valid" : result.result === "duplicate" ? "dup" : result.result === "reserved" ? "payFirst" : "invalid")}
                {(result as any).kind ? ` · ${t((result as any).kind)}` : ""}{(result as any).repeat ? ` · ${t("member")}` : ""}
                <small>
                  {result.code ?? result.reason}
                  {result.tier ? ` · ${result.tier}` : ""}
                  {result.holder ? ` · ${result.holder}` : ""}
                  {result.seat ? ` · ${result.seat}` : ""}
                </small>
              </div>
            )}
            {cam === "idle" && <button className="btn green" onClick={startCam}>{t("startCam")}</button>}
            {cam === "unsupported" && <div className="note">{t("noBD")}</div>}
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("pasteToken")} />
              </div>
              <button className="btn line sm" onClick={() => { check(token.trim()); setToken(""); }}>{t("check")}</button>
            </div>
            <div className="card pad">
              <div className="label" style={{ marginBottom: 4 }}>{t("recent")}</div>
              {recent.length ? (
                recent.map((r, i) => (
                  <div key={i} className="orow">
                    <div>
                      <b>{r.code ?? r.reason}</b>
                      <small>{r.result}{r.holder ? ` · ${r.holder}` : ""}</small>
                    </div>
                    <span className="note num">{r.at}</span>
                  </div>
                ))
              ) : (
                <div className="note">{t("noScans")}</div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
