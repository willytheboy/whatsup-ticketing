import Link from "next/link";
import { notFound } from "next/navigation";
import { Photo } from "@/components/Cards";
import OfferPicker from "./OfferPicker";
import ListingActions from "./ListingActions";
import MapCard from "@/components/MapCard";
import { sbServer } from "@/lib/supabase-server";
import { fmtDate, fmtTime, railKey } from "@/lib/config";
import { getLang, T } from "@/lib/lang-server";
import { LIST_SELECT, fill, meterTone, meterWord, isFeatured, type Listing } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

const pick = (lang: string, row: any, key: string) => (lang === "ar" && row?.[`${key}_ar`]) || row?.[key] || "";

/** Listing (brief §5.3): hero, description, live meter, room and radio, map, share, offers with pickers, total and actions. */
export default async function ListingPage({ params }: { params: { slug: string } }) {
  const lang = getLang();
  const t = (k: string) => T(lang, k);
  const db = sbServer();
  const { data } = await db.from("events").select(`${LIST_SELECT},description,description_ar,organisers(id,name,name_ar,plan)`).eq("slug", params.slug).in("status", ["live", "sold_out", "ended"]).maybeSingle();
  if (!data) notFound();
  const l = data as unknown as Listing;
  const title = pick(lang, l, "title");
  const venue = pick(lang, l.venues, "name");
  const city = pick(lang, l.venues, "city");
  const desc = pick(lang, l, "description");
  const p = fill(l);
  const when = l.kind === "event" ? `${fmtDate(l.starts_at)}, ${fmtTime(l.starts_at)}` : t(l.kind === "stay" ? "stayLine" : l.kind === "pass" ? "passLine" : "openDaily");
  const { data: stream } = l.venues?.id ? await db.from("v_streams").select("slug,status,title").eq("venue_id", l.venues.id).order("status").limit(1).maybeSingle() : { data: null };
  const lat = l.venues?.lat, lng = l.venues?.lng;

  return (
    <>
      <div className="hero">
        <Photo l={l} height={210}>
          <div className="shade" />
          <div className="body">
            <div style={{ fontSize: 11, opacity: 0.9 }}>{t(railKey(l.category).toLowerCase())} · {city}{isFeatured(l) ? ` · ★ ${t("featured")}` : ""}</div>
            <h1>{title}</h1>
            <div className="sub">{when} · {venue}</div>
          </div>
        </Photo>
        <Link href="/" className="icon start" aria-label={t("back")} style={{ position: "absolute" }}>‹</Link>
        <ListingActions slug={l.slug} title={l.title} line={`${when} · ${l.venues?.name ?? ""}`} />
      </div>
      <main>
        {desc && <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, color: "var(--ink2)" }}>{desc}</p>}
        {p !== null && (
          <div className="meter" style={{ marginTop: 0 }}>
            <span className="dot" style={{ background: meterTone(p) }} />
            <span>{p}% {t("fullNow")} · {meterWord(p, lang)}</span>
            <div className="bar"><b style={{ width: `${p}%`, background: meterTone(p) }} /></div>
          </div>
        )}
        <div className="grid2">
          <Link href={`/room/${l.id}`} className="btn line">💬 {t("room")}</Link>
          {stream ? (
            <Link href={`/live/${stream.slug}`} className="btn line">{stream.status === "live" ? "● " : "▶ "}{stream.status === "live" ? t("liveNow") : t("radio")}</Link>
          ) : (
            <Link href={`/story/${l.slug}`} className="btn line">⤴ {t("shareIg")}</Link>
          )}
        </div>
        {lat && lng ? <MapCard lat={lat} lng={lng} address={l.venues?.address ?? `${venue}, ${city}`} /> : null}
        <OfferPicker listing={{ id: l.id, slug: l.slug, title, kind: l.kind, status: l.status, organiser: l.organisers?.name ?? "" }} tiers={[...l.tiers].sort((a, b) => a.sort - b.sort)} tables={(l.tables_vip ?? []).filter((x) => !x.reserved_by_order)} deals={l.deals ?? []} />
      </main>
    </>
  );
}
