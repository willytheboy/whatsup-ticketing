"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "./supabase-browser";

type RoleState = { loaded: boolean; user: User | null; roles: string[] };
let cache: { uid: string | null; roles: string[] } | null = null;

/** Signed-in user and their tenant roles (memberships.role), with derived capability flags. */
export function useRoles() {
  const [state, setState] = useState<RoleState>({ loaded: false, user: null, roles: [] });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) {
        cache = { uid: null, roles: [] };
        if (alive) setState({ loaded: true, user: null, roles: [] });
        return;
      }
      if (cache && cache.uid === user.id) {
        if (alive) setState({ loaded: true, user, roles: cache.roles });
        return;
      }
      const { data } = await sb().from("memberships").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((m: { role: string }) => m.role);
      cache = { uid: user.id, roles };
      if (alive) setState({ loaded: true, user, roles });
    };
    load();
    const { data: sub } = sb().auth.onAuthStateChange(() => { cache = null; load(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  const has = (...r: string[]) => r.some((x) => state.roles.includes(x));
  const isAdmin = has("super_admin", "country_admin");
  return {
    ...state,
    isAdmin,
    isOrganiser: isAdmin || has("organiser"),
    isDoor: isAdmin || has("organiser", "door"),
    isPromoter: has("promoter"),
  };
}
