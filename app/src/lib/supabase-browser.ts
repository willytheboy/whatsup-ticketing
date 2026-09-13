"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;
/** Browser Supabase client (singleton). Sessions are stored in cookies so the user stays signed in across tabs. */
export const sb = () => client ?? (client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY));
