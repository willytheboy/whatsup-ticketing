import { cache } from "react";
import { cookies } from "next/headers";
import { sbServer } from "./supabase-server";
import { TENANT } from "./config";
import { DEFAULT_CONFIG, isTheme, mergeConfig, type TenantConfig } from "./features";

/** Tenant configuration for this request: one query per request (React cache), defaults if the row is missing.
    `?theme=` previews (set as a cookie by the middleware) override the tenant theme for that browser only. */
export const getTenantConfig = cache(async (): Promise<TenantConfig> => {
  let cfg = DEFAULT_CONFIG;
  try {
    const { data } = await sbServer().from("tenants").select("config,brand,name,country,country_ar").eq("slug", TENANT).maybeSingle();
    if (data) cfg = mergeConfig(data.config, data.brand, data);
  } catch {}
  const preview = cookies().get("theme")?.value;
  if (preview === "tenant") return cfg;
  if (isTheme(preview)) return { ...cfg, theme: preview };
  return cfg;
});
