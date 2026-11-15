"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { RowCard } from "@/components/Cards";
import { useConfig } from "@/components/Config";
import { sb } from "@/lib/supabase-browser";
import { useLang, useT } from "@/lib/lang";
import { LIST_SELECT, type Listing } from "@/lib/catalogue";
import { parseQuery, matches, searchOrder } from "@/lib/search";

/** Search (brief §5.2): a town, a cuisine, a beach, or a day. Day, price and "free" words filter (lib/search.ts);
    shortcuts for the common ones sit under the box. No-results hands off to the concierge. */
export default function SearchPage() {
  const t = useT();
  const lang = useLang();
  const { features, slug } = useConfig();
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Listing[] | null>(null);
  // the query lives in the address too (/search?q=…), so back from a listing returns to the same results and a search can be shared
  useEffect(() => { const v = new URLSearchParams(location.search).get("q"); if (v) setQ(v); }, []);
  useEffect(() => {
    const url = q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search";
    if (url !== `${location.pathname}${location.search}`) history.replaceState(history.state, "", url);
  }, [q]);
  useEffect(() => {
    sb().from("events").select(`${LIST_SELECT},tenants!inner(slug)`).eq("tenants.slug", slug).in("status", ["live", "sold_out"]).or(`kind.neq.event,starts_at.gte.${new Date(Date.now() - 864e5).toISOString()}`).order("starts_at")
      .then(({ data }) => setAll(((data ?? []) as unknown as Listing[]).filter((l) => (l.kind !== "stay" || features.stays) && (l.kind !== "pass" || features.passes))));
  }, [slug, features.stays, features.passes]);
  const needle = q.trim();
  const hits = useMemo(() => {
    if (!needle || !all) return [];
    const p = parseQuery(needle);
    return all.filter((l) => matches(l, p)).sort(searchOrder);
  }, [needle, all]);
  // one-tap shortcuts, written the way a person would type them so the box shows what was searched
  const quick: [string, string][] = [["tonight", t("tonight")], ["tomorrow", t("tomorrow")], ["weekend", t("weekend")], ["free", t("free")], ["under30", t("under30")]];
  return (
    <>
      <TopBar eyebrow={t("search")} />
      <main style={{ paddingTop: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("search")} autoFocus type="search" enterKeyHint="search"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 999, padding: "11px 16px", fontSize: 15, minHeight: 44, outline: "none" }} />
        <div className="chips" style={{ paddingTop: 0, paddingBottom: 0 }}>
          {quick.map(([k, label]) => {
            const text = lang === "ar" ? label : label.toLowerCase();
            return <button key={k} type="button" className={`chip ${needle === text ? "on" : ""}`} onClick={() => setQ(needle === text ? "" : text)}>{label}</button>;
          })}
        </div>
        <div aria-live="polite">
          {!needle && <p className="small">{t("tryQ")}</p>}
          {needle && all === null && <p className="small">{t("loading")}</p>}
          {needle && hits.map((l) => <RowCard key={l.id} l={l} lang={lang} />)}
          {needle && all !== null && !hits.length && (
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
