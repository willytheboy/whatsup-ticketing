import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import TierPicker from "./TierPicker";
import { sbServer } from "@/lib/supabase-server";
import { fmtDate, fmtTime } from "@/lib/config";
import { artClass } from "@/lib/art";
import { getLang, T } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: { slug: string } }) {
  const lang = getLang();
  const t = (k: string) => T(lang, k);
  const db = sbServer();
  const { data: ev } = await db
    .from("events")
    .select("id,slug,title,title_ar,description,description_ar,category,starts_at,doors_at,status,venues(name,name_ar,city,city_ar),organisers(name,name_ar),tiers(*),tables_vip(*)")
    .eq("slug", params.slug)
    .in("status", ["live", "sold_out", "ended"])
    .maybeSingle();
  if (!ev) notFound();

  const e = ev as any;
  const title = lang === "ar" && e.title_ar ? e.title_ar : e.title;
  const venue = lang === "ar" && e.venues?.name_ar ? e.venues.name_ar : e.venues?.name;
  const city = lang === "ar" && e.venues?.city_ar ? e.venues.city_ar : e.venues?.city;
  const organiser = lang === "ar" && e.organisers?.name_ar ? e.organisers.name_ar : e.organisers?.name;
  const desc = lang === "ar" && e.description_ar ? e.description_ar : e.description;
  const tiers = [...(e.tiers ?? [])].sort((a: any, b: any) => a.sort - b.sort);
  const tables = (e.tables_vip ?? []).filter((x: any) => !x.reserved_by_order);

  return (
    <>
      <TopBar back="/" title={title} />
      <main>
        <div className="hero">
          <div className={`art ${artClass(e.id)}`} />
          <div className="body">
            <span className="pill" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>{e.category}</span>
            <h1 className="display">{title}</h1>
            <p>{venue}, {city}</p>
          </div>
        </div>
        <div className="facts">
          <div className="fact">
            <div className="label">{t("when")}</div>
            <b className="num">{fmtDate(e.starts_at)} · {fmtTime(e.starts_at)}</b>
          </div>
          <div className="fact">
            <div className="label">{t("where")}</div>
            <b>{venue}</b>
          </div>
          <div className="fact">
            <div className="label">{t("organiser")}</div>
            <b>{organiser}</b>
          </div>
          <div className="fact">
            <div className="label">{t("doors")}</div>
            <b className="num">{fmtTime(e.doors_at ?? e.starts_at)}</b>
          </div>
        </div>
        {desc && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>{t("about")}</div>
            <p style={{ margin: 0, maxWidth: "62ch" }}>{desc}</p>
          </div>
        )}
        <TierPicker event={{ id: e.id, slug: e.slug, title }} tiers={tiers} tables={tables} />
      </main>
    </>
  );
}
