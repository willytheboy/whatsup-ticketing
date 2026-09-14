"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { I } from "@/components/Icons";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";
import { useFeature } from "@/components/Config";

/** Share and save (heart) in the hero: native share sheet with WhatsApp fallback (carries the promoter code); saved listings feed "For you". */
export default function ListingActions({ id, slug, title, line }: { id: string; slug: string; title: string; line: string }) {
  const toast = useToast();
  const router = useRouter();
  const t = useT();
  const canSave = useFeature("saved");
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => { sb().auth.getUser().then(async ({ data }) => { if (!data.user) return setSaved(false); const { data: s } = await sb().from("saved_listings").select("event_id").eq("user_id", data.user.id).eq("event_id", id).maybeSingle(); setSaved(!!s); }); }, [id]);
  const share = async () => {
    let ref = "";
    try { ref = localStorage.getItem("wu-ref") ?? ""; } catch {}
    const url = `${location.origin}/e/${slug}${ref ? `?ref=${ref}` : ""}`;
    const text = `${t("inviteMsg")} ${title} · ${line}`;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); toast(t("shared")); } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank");
      toast(t("shared"));
    }
  };
  const heart = async () => {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return router.push(`/login?next=/e/${slug}`);
    if (saved) { await sb().from("saved_listings").delete().eq("user_id", user.id).eq("event_id", id); setSaved(false); toast(t("unsaved")); }
    else { await sb().from("saved_listings").insert({ user_id: user.id, event_id: id }); setSaved(true); toast(t("savedListing")); }
  };
  return (
    <>
      {canSave && (
        <button className="icon" style={{ position: "absolute", top: 12, insetInlineEnd: 60 }} aria-label={t("save")} aria-pressed={!!saved} onClick={heart}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{saved ? "♥" : "♡"}</span>
        </button>
      )}
      <button className="icon" style={{ position: "absolute", top: 12 }} aria-label={t("share")} onClick={share}>
        <span style={{ width: 20, height: 20, display: "block" }}><I.share /></span>
      </button>
    </>
  );
}
