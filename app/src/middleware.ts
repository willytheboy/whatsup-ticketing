import { NextResponse, type NextRequest } from "next/server";

const THEMES = ["cedar", "volt", "sunset", "ultraviolet", "tenant"];
/** Hostname → tenant slug. TENANT_HOSTS is a JSON object, e.g. {"whatsup-cy.vercel.app":"cy","yalla.cy":"cy"}; a host that is not
    listed falls back to NEXT_PUBLIC_TENANT. A `<slug>.` subdomain of TENANT_BASE_HOST (e.g. cy.wul.app) also resolves. */
const HOSTS: Record<string, string> = (() => { try { return JSON.parse(process.env.TENANT_HOSTS ?? "{}"); } catch { return {}; } })();
const BASE_HOST = process.env.TENANT_BASE_HOST ?? "";
function tenantFor(host: string): string | null {
  const h = host.toLowerCase().split(":")[0];
  if (HOSTS[h]) return HOSTS[h];
  if (BASE_HOST && h.endsWith(`.${BASE_HOST}`)) { const sub = h.slice(0, -BASE_HOST.length - 1); if (/^[a-z]{2,8}$/.test(sub) && !["www", "app", "admin"].includes(sub)) return sub; }
  return null;
}

/**
 * One codebase, two Vercel projects. The whatsup-backoffice deployment (detected by hostname, or
 * NEXT_PUBLIC_APP_ROLE=backoffice) sends the root URL to the back office; the ticketing deployment serves Discover.
 * `?theme=volt` previews a theme in this browser only (cookie); `?theme=tenant` clears the preview.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const role = process.env.NEXT_PUBLIC_APP_ROLE ?? (host.startsWith("whatsup-backoffice") ? "backoffice" : "ticketing");
  if (role === "backoffice" && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }
  // tenant by hostname (multi-country on one deployment); server code reads it with getTenantSlug()
  const tenant = tenantFor(host);
  const reqHeaders = new Headers(req.headers);
  if (tenant) reqHeaders.set("x-tenant", tenant); else reqHeaders.delete("x-tenant"); // never trust a client-sent x-tenant
  const theme = req.nextUrl.searchParams.get("theme");
  if (theme && THEMES.includes(theme)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("theme");
    const res = NextResponse.redirect(url);
    if (theme === "tenant") res.cookies.delete("theme");
    else res.cookies.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    return res;
  }
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = { matcher: ["/((?!_next/|.*\\..*).*)"] };
