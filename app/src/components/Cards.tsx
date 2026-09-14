import Link from "next/link";
import { Facet } from "./Band";
import { tone, fmtDate, TZ } from "@/lib/config";
import { t, type Lang } from "@/lib/i18n";
import { badgeKind, fill, isFeatured, lowest, meterTone, type Listing } from "@/lib/catalogue";

/** Photo block: real photography when the listing has it, otherwise a flat brand colour with a faint facet. */
export function Photo({ l, height, children, credit }: { l: { id: string; cover_url?: string | null; title: string }; height: number; children?: React.ReactNode; credit?: string | null }) {
  return (
    <div className="photo" style={{ height, background: tone(l.id) }}>
      {l.cover_url ? <img src={l.cover_url} alt="" loading="lazy" /> : <Facet h={80} className="facet" style={{ height: "45%", position: "absolute", bottom: 0, opacity: 0.55, width: "100%" }} />}
      {children}
      {credit && <span className="badge end feat" style={{ fontWeight: 400 }}>📷 {credit}</span>}
    </div>
  );
}

export function Badge({ l, lang }: { l: Listing; lang: Lang }) {
  const k = badgeKind(l);
  const cls = k === "pass" ? "pass" : k === "ticket" ? "ev" : "";
  return <span className={`badge ${cls}`}>{t(lang, k)}</span>;
}

/** Short date line: events show the day, venues and stays say what they are. */
export function whenLine(l: Listing, lang: Lang): string {
  if (l.kind === "event") return fmtDate(l.starts_at, lang);
  if (l.kind === "stay") return t(lang, "stayLine");
  if (l.kind === "pass") return t(lang, "passLine");
  return t(lang, "openDaily");
}
export const dayNum = (iso: string) => Number(new Date(iso).toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ }));

const pickT = (lang: Lang, row: any, key: string) => (lang === "ar" && row?.[`${key}_ar`]) || row?.[key] || "";

/** Featured card: full width, photo, fan credit, badge, all-in price, one red action. */
export function BigCard({ l, lang }: { l: Listing; lang: Lang }) {
  const p = fill(l);
  const isTable = badgeKind(l) === "table";
  return (
    <Link href={`/e/${l.slug}`} className="card" style={{ display: "block", width: "100%", marginBottom: 10 }}>
      <Photo l={l} height={150}>
        <Badge l={l} lang={lang} />
        {isFeatured(l) && <span className="badge end feat">★ {t(lang, "featured")}</span>}
      </Photo>
      <div style={{ padding: "12px 14px" }}>
        <div className="title">{pickT(lang, l, "title")}</div>
        <div className="meta">{whenLine(l, lang)} · {pickT(lang, l.venues, "name")}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 14 }}>
            {p !== null && <span className="dot" style={{ background: meterTone(p) }} />}
            {lowest(l, lang)} {badgeKind(l) === "ticket" && l.tiers.some((x) => x.face_price > 0) ? <span className="small">{t(lang, "allIn")}</span> : null}
          </span>
          <span className="btn red sm">{isTable ? t(lang, "book") : t(lang, "open")}</span>
        </div>
      </div>
    </Link>
  );
}

/** Grid card: compact, with the live-venue dot. */
export function SmallCard({ l, lang }: { l: Listing; lang: Lang }) {
  const p = fill(l);
  return (
    <Link href={`/e/${l.slug}`} className="card" style={{ display: "block" }}>
      <Photo l={l} height={78}>
        <Badge l={l} lang={lang} />
        {isFeatured(l) && <span className="badge end feat">★</span>}
      </Photo>
      <div style={{ padding: "9px 10px" }}>
        <div className="title" style={{ fontSize: 13 }}>{pickT(lang, l, "title")}</div>
        <div className="meta" style={{ fontSize: 12 }}>
          {p !== null && <span className="dot" style={{ background: meterTone(p) }} />}
          {whenLine(l, lang)} · {lowest(l, lang)}
        </div>
      </div>
    </Link>
  );
}

/** Search / list row. */
export function RowCard({ l, lang }: { l: Listing; lang: Lang }) {
  return (
    <Link href={`/e/${l.slug}`} className="card pad" style={{ display: "block", width: "100%", marginBottom: 8 }}>
      <div className="row">
        <div className="title" style={{ fontSize: 14 }}>{pickT(lang, l, "title")}</div>
        <span className="small">{pickT(lang, l.venues, "city")}</span>
      </div>
      <div className="meta">{whenLine(l, lang)} · {lowest(l, lang)}</div>
    </Link>
  );
}
