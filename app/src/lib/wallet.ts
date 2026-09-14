"use client";
import { sb } from "./supabase-browser";

/* Wallet helpers (brief §5.5–5.7): rotating QR tokens minted on device, calendar files, ticket images. */

const KEYS = "wu-rotkeys";
const readKeys = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEYS) ?? "{}"); } catch { return {}; } };
const writeKeys = (k: Record<string, string>) => { try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch {} };

/** Fetch (once) and cache the per-ticket rotating keys for the tickets the holder owns. */
export async function ensureKeys(ids: string[]): Promise<Record<string, string>> {
  const have = readKeys();
  const missing = ids.filter((id) => !have[id]);
  if (missing.length) {
    const { data } = await sb().functions.invoke("wallet", { body: { action: "keys", ticket_ids: missing } });
    if (data?.keys) { Object.assign(have, data.keys); writeKeys(have); }
  }
  return have;
}
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const SLOT_SECONDS = 120;
/** WU2.<id>.<slot>.<sig> — a fresh token every two minutes; the door accepts the neighbouring slots. */
export async function rotatingToken(id: string, key: string): Promise<string> {
  const slot = Math.floor(Date.now() / 1000 / SLOT_SECONDS);
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64(await crypto.subtle.sign("HMAC", k, enc.encode(`${id}.${slot}`))).slice(0, 22);
  return `WU2.${id}.${slot}.${sig}`;
}
export const secondsToNextSlot = () => SLOT_SECONDS - (Math.floor(Date.now() / 1000) % SLOT_SECONDS);

/** .ics for a ticket (brief §5.5: add to calendar). */
export function icsFor(a: { title: string; start: string; end?: string | null; location?: string; url?: string; code?: string }): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = a.end ?? new Date(new Date(a.start).getTime() + 3 * 3600e3).toISOString();
  const esc = (s: string) => s.replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WhatsUp Lebanon//EN", "BEGIN:VEVENT", `UID:${a.code ?? Date.now()}@whatsuplebanon`, `DTSTAMP:${fmt(new Date().toISOString())}`, `DTSTART:${fmt(a.start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${esc(a.title)}`, a.location ? `LOCATION:${esc(a.location)}` : "", a.url ? `URL:${a.url}` : "", a.code ? `DESCRIPTION:${esc(`Ticket ${a.code} — show the QR in your WhatsUp wallet`)}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
}
export function download(name: string, blob: Blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Render a ticket as a PNG (1080×1350) with the static QR, for saving to Photos. */
export async function ticketImage(a: { title: string; line1: string; line2: string; code: string; holder: string; qrCanvas: HTMLCanvasElement | null }): Promise<Blob | null> {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  const ctx = c.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1080, 1350);
  // facet band
  const band = [["#3B6D11", [0, 0, 380, 0, 220, 160]], ["#639922", [220, 160, 380, 0, 760, 0, 600, 160]], ["#97C459", [600, 160, 760, 0, 1080, 0, 1080, 160]], ["#A32D2D", [860, 160, 900, 60, 940, 160]]] as [string, number[]][];
  for (const [col, pts] of band) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = "#7A7975"; ctx.font = "600 30px -apple-system, Segoe UI, Roboto, sans-serif"; ctx.fillText("WHAT'S UP LEBANON · TICKET", 64, 240);
  ctx.fillStyle = "#000"; ctx.font = "700 60px -apple-system, Segoe UI, Roboto, sans-serif";
  const words = a.title.split(" "); let line = "", y = 330; for (const w of words) { const test = line ? `${line} ${w}` : w; if (ctx.measureText(test).width > 950 && line) { ctx.fillText(line, 64, y); line = w; y += 70; } else line = test; } ctx.fillText(line, 64, y);
  ctx.fillStyle = "#444441"; ctx.font = "400 34px -apple-system, Segoe UI, Roboto, sans-serif"; ctx.fillText(a.line1, 64, y + 70); ctx.fillText(a.line2, 64, y + 120);
  ctx.setLineDash([12, 12]); ctx.strokeStyle = "#DDDBD3"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64, y + 170); ctx.lineTo(1016, y + 170); ctx.stroke(); ctx.setLineDash([]);
  if (a.qrCanvas) ctx.drawImage(a.qrCanvas, 64, y + 220, 520, 520);
  ctx.fillStyle = "#000"; ctx.font = "400 34px -apple-system, Segoe UI, Roboto, sans-serif"; ctx.fillText(a.holder, 640, y + 300);
  ctx.fillStyle = "#A32D2D"; ctx.font = "700 44px -apple-system, Segoe UI, Roboto, sans-serif"; ctx.fillText(a.code, 640, y + 370);
  ctx.fillStyle = "#7A7975"; ctx.font = "400 28px -apple-system, Segoe UI, Roboto, sans-serif"; ctx.fillText("Show the QR at the door.", 640, y + 430); ctx.fillText("Works offline.", 640, y + 470);
  ctx.fillText("All prices all-in · Tickets on WhatsApp · Cash welcome", 64, 1300);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}
