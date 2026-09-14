// Slim helper for the messaging worker (no ticket signing needed here).
import { createClient } from "npm:@supabase/supabase-js@2";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const APP_URL = (Deno.env.get("APP_URL") ?? "https://whatsup-ticketing-app.vercel.app").replace(/\/$/, "");
export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
export const cors = () => new Response("ok", { headers: CORS });
