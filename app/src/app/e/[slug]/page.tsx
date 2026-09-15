import Link from "next/link";
import { notFound } from "next/navigation";
import { Photo } from "@/components/Cards";
import OfferPicker from "./OfferPicker";
import ListingActions from "./ListingActions";
import MapCard from "@/components/MapCard";
import { sbServer } from "@/lib/supabase-server";
import { fmtDate, fmtTime, railKey } from "@/lib/config";
import { getLang, getT } from "@/lib/lang-server";
import { getTenantConfig } from "@/lib/features-server";
import { LIST_SELECT, fill, meterTone, meterWord, isFeatured, type Listing } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

const pick = (lang: string, row: any, key: string) => (lang === "ar" && row?.[`${key}_ar`]) || row?.[key] || "";

/** Listing (brief §5.3): hero, description, live meter, room and radio, map, share, offers with pickers, total and actions. */
export default async function ListingPage({ params, searchParams }: { params: { slug: string }; searchParams?: { tier?: string; qty?: string; via?: string; entry?: string } }) {
  const lang = getLang();
  const t = await getT(lang);
  const { features } = await getTenantConfig();
  const db = sbServer();
  const { data } = await db.from("events").select(`${LIST_SELECT},description,description_ar,organisers(id,name,name_ar,plan,whatsapp)`).eq("slug", params.slug).in("status", ["live", "sold_out", "ended"]).maybeSingle();
  if (!data) notFound();
  const l = data as unknown as Listing;
  if ((l.kind === "stay" && !features.stays) || (l.kind === "pass" && !features.passes)) notFound();
  const title = pick(lang, l, "title");
  const venue = pick(lang, l.venues, "name");
  const city = pick(lang, l.venues, "city");
  const desc = pick(lang, l, "description");
  const p = fill(l);
  const when = l.kind === "event" ? `${fmtDate(l.starts_at, lang)}, ${fmtTime(l.starts_at, lang)}` : t(l.kind === "stay" ? "stayLine" : l.kind === "pass" ? "passLine" : "openDaily");
  const { data: stream } = features.radio && l.venues?.id ? await db.from("v_streams").select("slug,status,title").eq("venue_id", l.venues.id).order("status").limit(1).maybeSingle() : { data: null };
  const lat = l.venues?.lat, lng = l.venues?.lng;

  return (
    <>
      <div className="hero">
        <Photo l={l} height={210}>
          <div className="shade" />
          <div className="body">
            <div style={{ fontSize: 11, opacity: 0.9 }}>{t(railKey(l.category).toLowerCase())} · {city}{isFeatured(l) ? ` · ★ ${t("featured")}` : ""}</div>
            <h1>{title}</h1>
            <div className="sub">{when} · {venue}{l.credit ? <span style={{ opacity: 0.75 }}> · 📷 {l.credit.replace(/^Photo:\s*/i, "").split(" · ")[0]}</span> : null}</div>
          </div>
        </Photo>
        <Link href="/" className="icon start" aria-label={t("back")} style={{ position: "absolute" }}>‹</Link>
        <ListingActions id={l.id} slug={l.slug} title={l.title} line={`${when} · ${l.venues?.name ?? ""}`} />
      </div>
      <main>
        {desc && <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, color: "var(--ink2)" }}>{desc}</p>}
        {pick(lang, l, "pinned") && <div className="pin">📌 {pick(lang, l, "pinned")}</div>}
        {p !== null && (
          <div className="meter" style={{ marginTop: 0 }}>
            <span className="dot" style={{ background: meterTone(p) }} />
            <span>{p}% {t("fullNow")} · {meterWord(p, lang)}</span>
            <div className="bar"><b style={{ width: `${p}%`, background: meterTone(p) }} /></div>
          </div>
        )}
        {(features.rooms || stream || features.story) && (
          <div className="grid2">
            {features.rooms && <Link href={`/room/${l.id}`} className="btn line">💬 {t("room")}</Link>}
            {stream ? (
              <Link href={`/live/${stream.slug}`} className="btn line">{stream.status === "live" ? "● " : "▶ "}{stream.status === "live" ? t("liveNow") : t("radio")}</Link>
            ) : features.story ? (
              <Link href={`/story/${l.slug}`} className="btn line" style={features.rooms ? undefined : { gridColumn: "span 2" }}>⤴ {t("shareIg")}</Link>
            ) : null}
          </div>
        )}
        {lat && lng ? <MapCard lat={lat} lng={lng} address={pick(lang, l.venues, "address") || `${venue}, ${city}`} /> : null}
        <OfferPicker listing={{ id: l.id, slug: l.slug, title, kind: l.kind, status: l.status, organiser: l.organisers?.name ?? "", organiserWa: (l.organisers as any)?.whatsapp ?? null }} tiers={[...l.tiers].sort((a, b) => a.sort - b.sort)} tables={(l.tables_vip ?? []).filter((x) => !x.reserved_by_order)} deals={l.deals ?? []} addons={features.addons ? (l.addon_options ?? []) : []} preset={searchParams?.tier ? { tier: searchParams.tier, qty: Math.min(20, Math.max(1, Number(searchParams.qty) || 1)), entry: searchParams.entry } : undefined} />
      </main>
    </>
  );
}
