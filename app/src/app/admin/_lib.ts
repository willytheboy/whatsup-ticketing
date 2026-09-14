"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "@/lib/supabase-browser";
import { useConfig } from "@/components/Config";

export type Tenant = { id: string; slug: string; name: string; base_currency: string; fx_rate: number };

/** Back-office session: signed-in user, whether they are a tenant admin, and the tenant row. */
export function useAdmin() {
  const { slug: TENANT } = useConfig();
  const [state, setState] = useState<{ loaded: boolean; user: User | null; isAdmin: boolean; tenant: Tenant | null }>({
    loaded: false, user: null, isAdmin: false, tenant: null,
  });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await sb().auth.getUser();
      const { data: tenant } = await sb().from("tenants").select("id,slug,name,base_currency,fx_rate").eq("slug", TENANT).maybeSingle();
      if (!user) return alive && setState({ loaded: true, user: null, isAdmin: false, tenant: tenant as Tenant | null });
      const { data: m } = await sb().from("memberships").select("role").eq("user_id", user.id).in("role", ["super_admin", "country_admin"]);
      if (alive) setState({ loaded: true, user, isAdmin: !!m?.length, tenant: tenant as Tenant | null });
    };
    load();
    const { data: sub } = sb().auth.onAuthStateChange(() => load());
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [TENANT]);
  return state;
}

/** Download rows as a CSV file (client side). */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
export const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : "");
