"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { RowCard } from "@/components/Cards";
import { sb } from "@/lib/supabase-browser";
import { useLang, useT } from "@/lib/lang";
import { LIST_SELECT, type Listing } from "@/lib/catalogue";

/** Search (brief §5.2): a town, a cuisine, a beach, or a day. No-results hands off to the concierge. */
export default function SearchPage() {
  const t = useT();
  const lang = useLang();
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Listing[]>([]);
  useEffect(() => {
    sb().from("events").select(LIST_SELECT).in("status", ["live", "sold_out"]).or(`kind.neq.event,starts_at.gte.${new Date(Date.now() - 864e5).toISOString()}`).order("starts_at")
      .then(({ data }) => setAll((data ?? []) as unknown as Listing[]));
  }, []);
  const needle = q.toLowerCase().trim();
  const free = /\bfree\b|ببلاش/.test(needle);
  const hits = needle
    ? all.filter((l) => {
        const hay = [l.title, l.title_ar, l.category, l.kind, l.venues?.name, l.venues?.name_ar, l.venues?.city, l.venues?.city_ar, ...l.tiers.map((x) => `${x.name} ${x.name_ar ?? ""} ${x.kind}`), ...(l.deals ?? []).map((d) => d.name)]
          .filter(Boolean).join(" ").toLowerCase();
        if (free && l.tiers.some((x) => Number(x.face_price) === 0)) return true;
        return needle.split(/\s+/).every((w) => hay.includes(w));
      })
    : [];
  return (
    <>
      <TopBar eyebrow={t("search")} />
      <main style={{ paddingTop: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("search")} autoFocus
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 999, padding: "11px 16px", fontSize: 15, minHeight: 44, outline: "none" }} />
        <div>
          {!needle && <p className="small">{t("tryQ")}</p>}
          {needle && hits.map((l) => <RowCard key={l.id} l={l} lang={lang} />)}
          {needle && !hits.length && (
            <>
              <p className="small">{t("noResults")}</p>
              <Link href={`/ask?q=${encodeURIComponent(q)}`} className="btn line full">{t("askConcierge")}</Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}
