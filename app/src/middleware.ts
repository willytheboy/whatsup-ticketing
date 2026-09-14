import { NextResponse, type NextRequest } from "next/server";

const THEMES = ["cedar", "volt", "sunset", "ultraviolet", "tenant"];

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
  const theme = req.nextUrl.searchParams.get("theme");
  if (theme && THEMES.includes(theme)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("theme");
    const res = NextResponse.redirect(url);
    if (theme === "tenant") res.cookies.delete("theme");
    else res.cookies.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
