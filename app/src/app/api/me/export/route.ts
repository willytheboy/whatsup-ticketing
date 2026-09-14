import { NextResponse } from "next/server";
import { sbUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
/** GET /api/me/export — everything WhatsUp holds about the signed-in user, as JSON (GDPR-style export). */
export async function GET() {
  const db = sbUser();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data, error } = await db.rpc("my_export");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="whatsup-export-${new Date().toISOString().slice(0, 10)}.json"` } });
}
