import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

/** Anonymous server-side client for public reads in server components (events, tiers, venues). */
export const sbServer = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
