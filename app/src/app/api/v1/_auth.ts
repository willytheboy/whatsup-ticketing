import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

/** Public API v1 (spec §platform): X-Api-Key → organiser scope through the api_* SQL functions (security definer, key hashed). */
export const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
export function keyOf(req: Request): string | null {
  const h = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return /^wu_[a-f0-9]{48}$/.test(h) ? h : null;
}
export const unauthorized = () => NextResponse.json({ error: "unauthorized", hint: "Send your organiser key in X-Api-Key (create one at /org/developers)." }, { status: 401, headers: { "WWW-Authenticate": "ApiKey" } });
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "x-api-key, authorization, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
