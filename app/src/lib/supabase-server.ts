import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

/** Anonymous server-side client for public reads in server components (events, tiers, venues). */
export const sbServer = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** Server-side client carrying the signed-in user's session from the auth cookies (RLS applies as that user). Read-only: it never writes cookies. */
export const sbUser = () => {
  const store = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
};
