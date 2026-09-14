"use client";
/* Door scanner storage (brief §5.12): the event manifest and the offline scan queue live in IndexedDB so the door
   keeps working when the venue's connection drops. Verification offline = exact token match against the manifest. */

export type ManifestTicket = { id: string; code: string; state: string; seat: string | null; scanned_at: string | null; valid_until: string | null; tier: string | null; kind: string; holder: string | null; token?: string };
export type Manifest = { event: { id: string; title: string }; at: string; tickets: ManifestTicket[]; tiers: { id: string; name: string; kind: string; capacity: number; sold: number }[] };
export type QueuedScan = { token: string; at: string; result: string; code?: string };

const DB = "wu-door", V = 1;
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, V);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("manifests")) d.createObjectStore("manifests"); if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  try {
    const d = await open();
    return await new Promise<T | undefined>((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const q = fn(s); t.oncomplete = () => res(q ? (q as IDBRequest<T>).result : undefined); t.onerror = () => rej(t.error); });
  } catch { return undefined; }
}
export const saveManifest = (eventId: string, m: Manifest) => tx("manifests", "readwrite", (s) => { s.put(m, eventId); });
export const loadManifest = (eventId: string) => tx<Manifest>("manifests", "readonly", (s) => s.get(eventId));
export const enqueue = (q: QueuedScan) => tx("queue", "readwrite", (s) => { s.add(q); });
export const readQueue = () => tx<QueuedScan[]>("queue", "readonly", (s) => s.getAll());
export const clearQueue = () => tx("queue", "readwrite", (s) => { s.clear(); });

/** Offline check: WU1 tokens must match a manifest ticket exactly; WU2 tokens match by ticket id (the slot freshness is checked). */
export function offlineCheck(m: Manifest, token: string): { result: string; ticket?: ManifestTicket; reason?: string } {
  const parts = token.trim().split(".");
  if (parts[0] === "WU2" && parts.length === 4) {
    const slot = Number(parts[2]); if (Math.abs(slot - Math.floor(Date.now() / 120000)) > 1) return { result: "invalid", reason: "expired_token" };
    const tk = m.tickets.find((t) => t.id === parts[1]); if (!tk) return { result: "invalid", reason: "unknown" };
    return judge(tk);
  }
  const tk = m.tickets.find((t) => t.token === token.trim() || (parts[0] === "WU1" && t.id === parts[1] && !t.token));
  if (!tk) return { result: "invalid", reason: "unknown" };
  return judge(tk);
}
function judge(tk: ManifestTicket) {
  if (tk.kind === "pass") return tk.valid_until && new Date(tk.valid_until) < new Date() ? { result: "expired", ticket: tk } : { result: "valid", ticket: tk };
  if (tk.state === "scanned") return { result: "duplicate", ticket: tk };
  if (tk.state === "reserved") return { result: "reserved", ticket: tk };
  if (tk.state !== "valid") return { result: "void", ticket: tk };
  return { result: "valid", ticket: tk };
}
