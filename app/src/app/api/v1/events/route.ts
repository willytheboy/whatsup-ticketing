import { NextResponse } from "next/server";
import { anon, keyOf, unauthorized, CORS } from "../_auth";

export const dynamic = "force-dynamic";
export async function OPTIONS() { return new NextResponse("ok", { headers: CORS }); }
/** GET /api/v1/events — the organiser's listings with tiers and live counts. */
export async function GET(req: Request) {
  const key = keyOf(req); if (!key) return unauthorized();
  const { data, error } = await anon().rpc("api_events", { p_key: key });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!Array.isArray(data)) return unauthorized();
  return NextResponse.json({ events: data, count: data.length }, { headers: CORS });
}
