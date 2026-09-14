"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "./supabase-browser";

type RoleState = { loaded: boolean; user: User | null; roles: string[]; orgIds: string[] };
let cache: { uid: string | null; roles: string[]; orgIds: string[] } | null = null;

/** Signed-in user and their tenant roles (memberships.role), with derived capability flags. */
export function useRoles() {
  const [state, setState] = useState<RoleState>({ loaded: false, user: null, roles: [], orgIds: [] });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) {
        cache = { uid: null, roles: [], orgIds: [] };
        if (alive) setState({ loaded: true, user: null, roles: [], orgIds: [] });
        return;
      }
      if (cache && cache.uid === user.id) {
        if (alive) setState({ loaded: true, user, roles: cache.roles, orgIds: cache.orgIds });
        return;
      }
      const { data } = await sb().from("memberships").select("role,organiser_id").eq("user_id", user.id);
      const roles = (data ?? []).map((m: { role: string }) => m.role);
      const orgIds = (data ?? []).map((m: { organiser_id: string | null }) => m.organiser_id).filter(Boolean) as string[];
      cache = { uid: user.id, roles, orgIds };
      if (alive) setState({ loaded: true, user, roles, orgIds });
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
    admin: isAdmin,
    isOrganiser: isAdmin || has("organiser"),
    isDoor: isAdmin || has("organiser", "door"),
    isPromoter: has("promoter"),
  };
}
