"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

/** Creates a squad for a listing from the wallet or the listing page, then opens it. */
function NewSquadInner() {
  const t = useT();
  const sp = useSearchParams();
  const router = useRouter();
  const [err, setErr] = useState("");
  useEffect(() => {
    (async () => {
      const eventId = sp.get("event"); const tierId = sp.get("tier");
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace(`/login?next=${encodeURIComponent(`/squad/new?event=${eventId}${tierId ? `&tier=${tierId}` : ""}`)}`);
      const { data: ev } = await sb().from("events").select("id,slug,title,title_ar,tenant_id,tiers(id,name,kind,face_price,sort)").eq("id", eventId).maybeSingle();
      if (!ev) return setErr(t("notFound"));
      const tiers = [...(ev.tiers ?? [])].filter((x: any) => x.kind !== "pass").sort((a: any, b: any) => a.sort - b.sort);
      const tier = tiers.find((x: any) => x.id === tierId) ?? tiers[0];
      if (!tier) return setErr(t("notFound"));
      const { data: p } = await sb().from("profiles").select("name").eq("id", user.id).maybeSingle();
      const { data: sq, error } = await sb().from("squads").insert({ tenant_id: ev.tenant_id, owner_id: user.id, name: `${p?.name ?? t("you")} · ${ev.title}`, members: [{ user_id: user.id, name: p?.name ?? t("you"), paid: false }], items: [{ event_id: ev.id, slug: ev.slug, title: ev.title, title_ar: ev.title_ar, tier_id: tier.id, tier: tier.name, kind: tier.kind, face: Number(tier.face_price), qty: 1 }] }).select("id").single();
      if (error || !sq) return setErr(error?.message ?? "squad");
      router.replace(`/squad/${sq.id}`);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <><TopBar back="/wallet" title={t("squad")} /><main><div className="empty">{err || t("loading")}</div></main></>;
}
export default function NewSquad() { return <Suspense><NewSquadInner /></Suspense>; }
