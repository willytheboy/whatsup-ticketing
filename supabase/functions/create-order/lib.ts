// Canonical copy of the helper module that each edge function bundles as ./lib.ts
// (Supabase deploys one folder per function, so the file is duplicated per function.)
import { createClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TICKET_SECRET = Deno.env.get("TICKET_SECRET") ?? SERVICE_KEY;

export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
export const asUser = (req: Request) =>
  createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

export const cors = () => new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });

const enc = new TextEncoder();
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(TICKET_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22);
}
export async function signTicket(ticketId: string): Promise<string> { return `WU1.${ticketId}.${await hmac(ticketId)}`; }
export async function verifyToken(token: string): Promise<string | null> {
  const [v, id, sig] = token.split(".");
  if (v !== "WU1" || !id || !sig) return null;
  return (await hmac(id)) === sig ? id : null;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
