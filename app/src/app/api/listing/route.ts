import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
/** A listing's sellable offers by slug — used by the concierge to build a cart without loading the page. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const { data } = await sbServer().from("events").select("id,slug,title,kind,tiers(id,name,kind,face_price,per_order_limit,note,plan_months,sort,role,admits,requires_access,per)").eq("slug", slug).in("status", ["live", "sold_out"]).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ...data, tiers: [...(data.tiers ?? [])].sort((a: any, b: any) => a.sort - b.sort) });
}
