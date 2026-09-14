import { NextResponse } from "next/server";
import { anon, keyOf, unauthorized, CORS } from "../../_auth";

export const dynamic = "force-dynamic";
export async function OPTIONS() { return new NextResponse("ok", { headers: CORS }); }
/** GET /api/v1/events/:slug — one listing. */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const key = keyOf(req); if (!key) return unauthorized();
  const { data, error } = await anon().rpc("api_events", { p_key: key });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  const ev = (Array.isArray(data) ? data : []).find((e: any) => e.slug === params.slug || e.id === params.slug);
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
  return NextResponse.json(ev, { headers: CORS });
}
