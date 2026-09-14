"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "./supabase-browser";
import { planOf, type PlanId } from "./config";

export type Org = { id: string; tenant_id: string; name: string; name_ar: string | null; plan: PlanId; plan_until: string | null; verified: boolean; role: string; whatsapp: string | null; credit_month: string | null };

/** The signed-in user's venue / organiser account (first one) and its plan. */
export function useOrg() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [org, setOrg] = useState<Org | null | undefined>(undefined);
  const reload = async () => {
    const { data: { user } } = await sb().auth.getUser();
    setUser(user);
    if (!user) return setOrg(null);
    const { data } = await sb().from("v_my_organisers").select("*").order("role").limit(1).maybeSingle();
    const o = data as Org | null;
    if (o && o.plan === "pro" && o.plan_until && new Date(o.plan_until) < new Date()) o.plan = "free"; // lapsed
    setOrg(o);
  };
  useEffect(() => { reload(); }, []);
  return { user, org, plan: planOf(org?.plan), reload };
}
