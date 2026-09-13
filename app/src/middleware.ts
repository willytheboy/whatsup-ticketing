import { NextResponse, type NextRequest } from "next/server";

/**
 * One codebase, two Vercel projects. The whatsup-backoffice deployment (detected by hostname, or
 * NEXT_PUBLIC_APP_ROLE=backoffice) sends the root URL to the back office; the ticketing deployment serves Discover.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const role = process.env.NEXT_PUBLIC_APP_ROLE ?? (host.startsWith("whatsup-backoffice") ? "backoffice" : "ticketing");
  if (role === "backoffice" && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
