"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";
import { saveManifest, loadManifest, enqueue, readQueue, clearQueue, offlineCheck, type Manifest } from "@/lib/door";

type Ev = { event_id: string; title: string; sold: number; checked_in: number };
type Scan = { result: string; code?: string; reason?: string; tier?: string; holder?: string; seat?: string | null; at?: string; kind?: string; repeat?: boolean; order_id?: string; deposit?: number | null; party?: number | null; attempts?: number; offline?: boolean; rotating?: boolean };

/** Door check-in (brief §5.12): camera QR via BarcodeDetector, jsQR fallback for iOS Safari, paste, name lookup.
    Works offline from a cached manifest; scans made offline queue and sync when the connection returns. */
export default function DoorScanner() {
  const t = useT();
  const toast = useToast();
  const [events, setEvents] = useState<Ev[]>([]);
  const [eventId, setEventId] = useState("");
  const [result, setResult] = useState<Scan | null>(null);
  const [token, setToken] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [cam, setCam] = useState<"idle" | "on" | "unsupported">("idle");
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [recent, setRecent] = useState<Scan[]>([]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [dupes, setDupes] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const lastTok = useRef<{ tok: string; at: number }>({ tok: "", at: 0 });

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); sync(); }; const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return;
      const { data: ev } = await sb().from("organiser_event_stats").select("event_id,title,sold,checked_in").order("starts_at");
      setEvents((ev ?? []) as Ev[]);
      const remembered = localStorage.getItem("wu-door-event");
      const first = (ev ?? []).find((e: any) => e.event_id === remembered)?.event_id ?? ev?.[0]?.event_id;
      if (first) setEventId(first);
    });
    readQueue().then((rows) => setQueued(rows?.length ?? 0));
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem("wu-door-event", eventId);
    loadManifest(eventId).then((m) => m && setManifest(m));
    if (navigator.onLine) refreshManifest();
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshManifest = async () => {
    if (!eventId) return;
    const { data } = await sb().functions.invoke("scan", { body: { action: "manifest", event_id: eventId } });
    if (data?.tickets) { setManifest(data); await saveManifest(eventId, data); }
  };
  const sync = async () => {
    const rows = await readQueue();
    if (!rows?.length || !eventId) return;
    const { data, error } = await sb().functions.invoke("scan", { body: { action: "sync", event_id: eventId, scans: rows } });
    if (!error && data?.synced != null) { await clearQueue(); setQueued(0); toast(`${t("synced")} · ${data.synced}`); refreshManifest(); }
  };

  const show = (r: Scan) => {
    setResult(r);
    setRecent((s) => [{ ...r, at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }, ...s].slice(0, 30));
    if (r.result === "duplicate") setDupes((n) => n + 1);
    if (navigator.vibrate) navigator.vibrate(r.result === "valid" ? 80 : [60, 40, 60]);
    setTimeout(() => { setResult(null); busy.current = false; }, r.result === "reserved" ? 6000 : 2200);
  };
  const check = async (tok: string) => {
    tok = tok.trim();
    if (busy.current || !eventId || !tok) return;
    if (lastTok.current.tok === tok && Date.now() - lastTok.current.at < 4000) return; // the same QR held in front of the camera
    lastTok.current = { tok, at: Date.now() };
    busy.current = true;
    if (!navigator.onLine && manifest) {
      const o = offlineCheck(manifest, tok);
      const r: Scan = { result: o.result, reason: o.reason, code: o.ticket?.code, tier: o.ticket?.tier ?? undefined, holder: o.ticket?.holder ?? undefined, seat: o.ticket?.seat, kind: o.ticket?.kind, offline: true };
      if (o.ticket && (o.result === "valid" || o.result === "duplicate")) { o.ticket.state = "scanned"; o.ticket.scanned_at = new Date().toISOString(); await saveManifest(eventId, manifest); }
      await enqueue({ token: tok, at: new Date().toISOString(), result: o.result, code: o.ticket?.code }); setQueued((n) => n + 1);
      return show(r);
    }
    const { data, error } = await sb().functions.invoke("scan", { body: { token: tok, event_id: eventId, device_id: "web-" + navigator.userAgent.slice(0, 20) } });
    if (error && manifest) { setOnline(false); busy.current = false; return check(tok); }
    const r: Scan = data ?? { result: "invalid", reason: error?.message };
    if (manifest && (r.result === "valid" || r.result === "duplicate")) { const tk = manifest.tickets.find((x) => x.code === r.code); if (tk) { tk.state = "scanned"; tk.scanned_at = new Date().toISOString(); } }
    show(r);
  };
  const collect = async (orderId: string) => {
    const { data, error } = await sb().functions.invoke("scan", { body: { action: "collect", event_id: eventId, order_id: orderId } });
    if (error || !data?.ok) return toast(error?.message ?? t("invalid"));
    toast(t("collected")); setResult(null); busy.current = false; refreshManifest();
  };
  const lookup = async (s: string) => {
    setQ(s);
    if (s.trim().length < 3) return setFound([]);
    if (manifest && !navigator.onLine) return setFound(manifest.tickets.filter((x) => (x.holder ?? "").toLowerCase().includes(s.toLowerCase()) || x.code.toLowerCase().includes(s.toLowerCase())).slice(0, 10));
    const { data } = await sb().functions.invoke("scan", { body: { action: "lookup", event_id: eventId, q: s } });
    setFound(data?.tickets ?? []);
  };
  const simulate = () => {
    const pool = manifest?.tickets.filter((x) => x.token && x.state === "valid") ?? [];
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : manifest?.tickets.find((x) => x.token);
    if (pick?.token) check(pick.token); else toast(t("noScans"));
  };

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (video.current) { video.current.srcObject = stream; await video.current.play(); }
    } catch { return setCam("unsupported"); }
    setCam("on");
    const Detector = (window as any).BarcodeDetector;
    if (Detector) {
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!video.current?.srcObject) return;
        try { const codes = await detector.detect(video.current); if (codes[0]?.rawValue) await check(codes[0].rawValue); } catch {}
        setTimeout(tick, 250);
      };
      tick();
      return;
    }
    const jsQR = (await import("jsqr")).default; // iOS Safari has no BarcodeDetector
    const tick = () => {
      const v = video.current, c = canvas.current;
      if (!v?.srcObject || !c) return;
      if (v.videoWidth) {
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data) check(code.data);
      }
      setTimeout(tick, 300);
    };
    tick();
  };

  const tone = result ? (result.result === "valid" ? "ok" : result.result === "duplicate" ? "dup" : "bad") : "";
  const ev = events.find((e) => e.event_id === eventId);
  const scannedNow = manifest ? manifest.tickets.filter((x) => x.state === "scanned").length : ev?.checked_in ?? 0;
  const soldNow = manifest ? manifest.tickets.filter((x) => x.state !== "reserved").length : ev?.sold ?? 0;

  return (
    <>
      <TopBar back="/profile" title={t("doorMode")} right={<span className={`tag ${online ? "ok" : ""}`} role="status">{online ? t("onlineK") : t("offlineK")}{queued ? ` · ${queued}` : ""}</span>} />
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
            <div className="kpis" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div className="kpi"><b className="num">{scannedNow}</b><span>{t("checkedInK")}</span></div>
              <div className="kpi"><b className="num">{Math.max(0, soldNow - scannedNow)}</b><span>{t("expected")}</span></div>
              <div className="kpi" style={dupes ? { borderColor: "var(--red)" } : undefined}><b className="num" style={dupes ? { color: "var(--red-dark)" } : undefined}>{dupes}</b><span>{t("duplicates")}</span></div>
            </div>
            <div className="scanbox">
              <video ref={video} muted playsInline />
              <canvas ref={canvas} hidden />
              <div className="frame" />
              {cam !== "on" && <span className="small" style={{ color: "#fff", position: "absolute" }}>{t("camMsg")}</span>}
            </div>
            {result && (
              <div className={`result ${tone}`} role="status" aria-live="assertive">
                {t(result.result === "valid" ? "valid" : result.result === "duplicate" ? "dup" : result.result === "reserved" ? "payFirst" : result.result === "expired" ? "expiredK" : "invalid")}
                {result.kind ? ` · ${t(result.kind)}` : ""}{result.repeat ? ` · ${t("member")}` : ""}{result.offline ? ` · ${t("offlineK")}` : ""}
                <small>
                  {result.code ?? (result.reason ? t(result.reason === "expired_token" ? "staleQr" : result.reason === "wrong_event" ? "wrongEvent" : "invalid") : "")}
                  {result.tier ? ` · ${result.tier}` : ""}
                  {result.holder ? ` · ${result.holder}` : ""}
                  {result.seat ? ` · ${result.seat}` : ""}
                  {result.deposit ? ` · ${t("deposit")} $${result.deposit}${result.party ? ` · ${result.party} ${t("seats")}` : ""}` : ""}
                  {result.result === "duplicate" && result.attempts ? ` · ${result.attempts}× ` : ""}
                </small>
                {result.result === "reserved" && result.order_id && <button className="btn sm" style={{ marginTop: 8, background: "#fff", color: "#000" }} onClick={() => collect(result.order_id!)}>{t("markPaid")}</button>}
              </div>
            )}
            {cam === "idle" && <button className="btn green" onClick={startCam}>{t("startCam")}</button>}
            {cam === "unsupported" && <div className="note">{t("noBD")}</div>}
            <div className="row">
              <div className="field" style={{ flex: 1 }}><input value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("pasteToken")} /></div>
              <button className="btn line sm" onClick={() => { check(token.trim()); setToken(""); }}>{t("check")}</button>
            </div>
            <div className="field"><input value={q} onChange={(e) => lookup(e.target.value)} placeholder={t("lookupPh")} /></div>
            {found.length > 0 && (
              <div className="card pad">
                {found.map((f: any) => (
                  <div key={f.id} className="orow">
                    <div><b>{f.holder ?? "—"}</b><small>{f.code} · {f.tier ?? f.kind} · {t(f.state === "scanned" ? "checkedIn" : f.state === "reserved" ? "payAtDoor" : f.state)}</small></div>
                    {f.token && f.state === "valid" && <button className="btn xs green" onClick={() => { check(f.token); setFound([]); setQ(""); }}>{t("checkIn")}</button>}
                  </div>
                ))}
              </div>
            )}
            <div className="grid2">
              <button className="btn line sm" onClick={refreshManifest} disabled={!online}>{t("refreshList")}{manifest ? ` · ${manifest.tickets.length}` : ""}</button>
              <button className="btn line sm" onClick={queued ? sync : simulate}>{queued ? `${t("syncNow")} · ${queued}` : t("simulate")}</button>
            </div>
            <div className="card pad">
              <div className="label" style={{ marginBottom: 4 }}>{t("recent")}</div>
              {recent.length ? recent.map((r, i) => (
                <div key={i} className="orow">
                  <div><b>{r.code ?? r.reason}</b><small>{r.result}{r.holder ? ` · ${r.holder}` : ""}{r.offline ? ` · ${t("offlineK")}` : ""}</small></div>
                  <span className="note num">{r.at}</span>
                </div>
              )) : <div className="note">{t("noScans")}</div>}
            </div>
          </>
        )}
      </main>
    </>
  );
}
