"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase-browser";
import { useLang, useT } from "@/lib/lang";

/** Pass promo card on Home: hidden once the signed-in user holds a valid pass (brief §5.1). */
export default function PassPromo({ slug, title, title_ar, from }: { slug: string; title: string; title_ar: string | null; from: number }) {
  const t = useT();
  const lang = useLang();
  const [show, setShow] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return setShow(true);
      const { data } = await sb().from("tickets").select("id,valid_until,tiers!inner(kind)").eq("holder_id", user.id).in("state", ["valid", "scanned"]).eq("tiers.kind", "pass");
      const has = (data ?? []).some((p: any) => !p.valid_until || new Date(p.valid_until) > new Date());
      setShow(!has);
    })();
  }, []);
  if (!show) return null;
  return (
    <Link href={`/e/${slug}`} className="card tint pad" style={{ display: "block", width: "100%", marginTop: 10 }}>
      <div className="row">
        <div>
          <div className="title" style={{ fontSize: 14, color: "var(--g0)" }}>{lang === "ar" && title_ar ? title_ar : title}</div>
          <div className="meta" style={{ color: "var(--g1)" }}>{t("passLine")} · {t("from")} ${from} {t("perMonth")}</div>
        </div>
        <span style={{ color: "var(--g0)" }}>›</span>
      </div>
    </Link>
  );
}
