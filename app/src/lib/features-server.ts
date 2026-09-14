import { cache } from "react";
import { cookies } from "next/headers";
import { sbServer } from "./supabase-server";
import { getTenantSlug } from "./tenant-server";
import { DEFAULT_CONFIG, isTheme, mergeConfig, type TenantConfig } from "./features";

/** Tenant configuration for this request: one query per request (React cache), defaults if the row is missing.
    `?theme=` previews (set as a cookie by the middleware) override the tenant theme for that browser only. */
export const getTenantConfig = cache(async (): Promise<TenantConfig> => {
  const slug = getTenantSlug();
  let cfg: TenantConfig = { ...DEFAULT_CONFIG, slug };
  try {
    const { data } = await sbServer().from("tenants").select("slug,config,brand,name,country,country_ar").eq("slug", slug).maybeSingle();
    if (data) cfg = mergeConfig(data.config, data.brand, data);
  } catch {}
  const preview = cookies().get("theme")?.value;
  if (preview === "tenant") return cfg;
  if (isTheme(preview)) return { ...cfg, theme: preview };
  return cfg;
});
