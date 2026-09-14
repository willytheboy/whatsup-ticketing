import { headers } from "next/headers";
import { TENANT } from "./config";

/** The tenant for this request. The middleware maps the hostname to a slug (TENANT_HOSTS) and passes it as x-tenant;
    a deployment without a mapping serves NEXT_PUBLIC_TENANT (the one-country setup). */
export function getTenantSlug(): string {
  try { return headers().get("x-tenant") || TENANT; } catch { return TENANT; }
}
