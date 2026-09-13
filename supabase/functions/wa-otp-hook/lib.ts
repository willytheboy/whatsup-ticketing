import { createClient } from "npm:@supabase/supabase-js@2";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
