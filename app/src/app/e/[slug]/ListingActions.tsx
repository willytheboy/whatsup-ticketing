"use client";
import { useToast } from "@/components/Toast";
import { I } from "@/components/Icons";
import { useT } from "@/lib/lang";

/** Share icon in the hero: native share sheet, WhatsApp fallback. Carries the promoter code if one is stored. */
export default function ListingActions({ slug, title, line }: { slug: string; title: string; line: string }) {
  const toast = useToast();
  const t = useT();
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
  return (
    <button className="icon" style={{ position: "absolute", top: 12 }} aria-label={t("share")} onClick={share}>
      <span style={{ width: 20, height: 20, display: "block" }}><I.share /></span>
    </button>
  );
}
