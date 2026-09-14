import { NextResponse } from "next/server";
import { anon, keyOf, unauthorized, CORS } from "../_auth";

export const dynamic = "force-dynamic";
export async function OPTIONS() { return new NextResponse("ok", { headers: CORS }); }
/** GET /api/v1/orders?since=ISO — the organiser's orders with lines and ticket states (default: last 30 days). */
export async function GET(req: Request) {
  const key = keyOf(req); if (!key) return unauthorized();
  const since = new URL(req.url).searchParams.get("since");
  const { data, error } = await anon().rpc("api_orders", { p_key: key, ...(since ? { p_since: new Date(since).toISOString() } : {}) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!Array.isArray(data)) return unauthorized();
  return NextResponse.json({ orders: data, count: data.length, since: since ?? "30d" }, { headers: CORS });
}
