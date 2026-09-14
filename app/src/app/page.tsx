import Link from "next/link";
import Band from "@/components/Band";
import CityPill from "@/components/CityPill";
import PassPromo from "@/components/PassPromo";
import { BigCard, SmallCard } from "@/components/Cards";
import { I } from "@/components/Icons";
import { sbServer, sbUser } from "@/lib/supabase-server";
import { TENANT, RAIL, SUPABASE_URL, SUPABASE_ANON_KEY, railKey } from "@/lib/config";
import { getLang, getCity, getT } from "@/lib/lang-server";
import { getTenantConfig } from "@/lib/features-server";
import { LIST_SELECT, inRail, isFeatured, type Listing } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

/** Home (brief §5.1): the feed is the box office. Facet band, city pill, category rail, one featured card, a two-column grid,
    the pass promo when the user holds no pass, and the #WeAreLebanon card. */
export default async function Home({ searchParams }: { searchParams: { c?: string; ref?: string } }) {
  const lang = getLang();
  const t = await getT(lang);
  const { features } = await getTenantConfig();
  const city = getCity();
  const rail = RAIL.some(([k]) => k === searchParams.c) ? (searchParams.c as string) : "all";
  const now = new Date();
  const db = sbServer();
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", TENANT).maybeSingle();
  let q = db.from("events").select(LIST_SELECT).in("status", ["live", "sold_out"]).or(`kind.neq.event,starts_at.gte.${new Date(now.getTime() - 864e5).toISOString()}`).order("starts_at");
  if (tenant) q = q.eq("tenant_id", tenant.id);
  const me = sbUser();
  const [{ data }, { data: tenants }, { data: { user } }] = await Promise.all([q, db.from("tenants").select("slug,name,country,country_ar,live").order("live", { ascending: false }), me.auth.getUser()]);
  const all = ((data ?? []) as unknown as Listing[]).filter((l) => (l.kind !== "stay" || features.stays) && (l.kind !== "pass" || features.passes));
  // For you: categories the signed-in user bought or saved before, minus what they already hold
  // taste-ranked (v0.7): what they bought weighs more than what they saved; same venue > same category > same city > same kind.
  // The rail says why ("Because you liked Nightlife"), and never repeats what they already hold.
  let forYou: Listing[] = [];
  let because = "";
  if (user && features.for_you) {
    const [{ data: mine }, { data: saved }] = await Promise.all([
      me.from("orders").select("event_id,events(category,kind,venue_id,venues(city))").eq("buyer_id", user.id).in("status", ["paid", "reserved"]).order("created_at", { ascending: false }).limit(50),
      me.from("saved_listings").select("event_id,events(category,kind,venue_id,venues(city))").eq("user_id", user.id).limit(50),
    ]);
    const seen = new Set((mine ?? []).map((o: any) => o.event_id));
    const taste = { cat: new Map<string, number>(), venue: new Map<string, number>(), city: new Map<string, number>(), kind: new Map<string, number>() };
    const bump = (m: Map<string, number>, k: string | null | undefined, w: number) => { if (k) m.set(k, (m.get(k) ?? 0) + w); };
    for (const [rows, w] of [[mine ?? [], 2], [saved ?? [], 1]] as [any[], number][]) for (const r of rows) { const e = r.events; if (!e) continue; bump(taste.cat, e.category, w); bump(taste.venue, e.venue_id, w); bump(taste.city, e.venues?.city, w); bump(taste.kind, e.kind, w); }
    if (taste.cat.size || taste.venue.size) {
      const score = (l: Listing) => (taste.venue.get(l.venues?.id ?? "") ?? 0) * 3 + (taste.cat.get(l.category) ?? 0) * 2 + (taste.city.get(l.venues?.city ?? "") ?? 0) + (taste.kind.get(l.kind) ?? 0) * 0.5;
      forYou = all.filter((l) => !seen.has(l.id) && score(l) > 0).sort((a, b) => score(b) - score(a) || a.starts_at.localeCompare(b.starts_at)).slice(0, 6);
      const topCat = [...taste.cat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topCat) because = `${t("becauseYouLiked")} ${t(railKey(topCat).toLowerCase())}`;
    }
  }
  const cities = Array.from(new Map(all.filter((l) => l.venues).map((l) => [l.venues!.city, { name: l.venues!.city, name_ar: l.venues!.city_ar }])).values());
  const inCity = city ? all.filter((l) => l.venues?.city === city) : all;
  const list = inCity.filter((l) => inRail(l, rail));
  // featured first (paid placement), then soonest events, then venues/stays/passes
  list.sort((a, b) => Number(isFeatured(b, now)) - Number(isFeatured(a, now)) || (a.kind === "event" ? 0 : 1) - (b.kind === "event" ? 0 : 1) || a.starts_at.localeCompare(b.starts_at));
  const big = rail === "all" ? list.find((l) => isFeatured(l, now)) ?? list.find((l) => l.kind === "event") : undefined;
  const rest = list.filter((l) => l !== big);
  const pass = all.find((l) => l.kind === "pass");
  const passFrom = pass ? Math.min(...pass.tiers.map((x) => Number(x.face_price))) : 0;
  const cityLabel = city ? (lang === "ar" && cities.find((c) => c.name === city)?.name_ar) || city : t("allCities");

  return (
    <>
      <Band h={120} top={t("wm1")} main={t("country")}>
        <CityPill city={city} cities={cities} label={cityLabel} soon={(tenants ?? []).filter((x: any) => !x.live).map((x: any) => ({ name: x.country ?? x.name, name_ar: x.country_ar }))} />
        <Link href="/profile" className="icon" aria-label={t("profile")}><span style={{ width: 22, height: 22, display: "block" }}><I.user /></span></Link>
      </Band>
      <div className="chips" style={{ margin: 0 }}>
        {RAIL.map(([k, label]) => (
          <Link key={k} href={k === "all" ? "/" : `/?c=${k}`} className={`chip ${rail === k ? "on" : ""}`}>{t(label)}</Link>
        ))}
      </div>
      <main className="flush" style={{ gap: 0 }}>
        {searchParams.ref && <p className="small" style={{ color: "var(--g1)", margin: "0 0 10px" }}>{t("refApplied")} {searchParams.ref.toUpperCase()}</p>}
        {rail === "all" && forYou.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="row between" style={{ marginBottom: 6 }}><span className="eyebrow">{t("forYou")}{because ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}> · {because}</span> : null}</span>{features.saved && <Link href="/saved" className="small" style={{ color: "var(--g1)", fontWeight: 600 }}>{t("savedListings")} →</Link>}</div>
            <div className="chips" style={{ margin: 0, gap: 10, overflowX: "auto" }}>
              {forYou.map((l) => <div key={l.id} style={{ minWidth: 170, maxWidth: 170, flex: "none" }}><SmallCard l={l} lang={lang} /></div>)}
            </div>
          </div>
        )}
        {big && <BigCard l={big} lang={lang} />}
        {rest.length > 0 && (
          <div className="grid2">
            {rest.map((l) => <SmallCard key={l.id} l={l} lang={lang} />)}
          </div>
        )}
        {!list.length && <p className="small" style={{ padding: "10px 0" }}>{t("noResults")}</p>}
        {rail === "all" && pass && <PassPromo slug={pass.slug} title={pass.title} title_ar={pass.title_ar} from={passFrom} />}
        {features.moments && (
          <Link href="/moment" className="moment" style={{ marginTop: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>📷 {t("momentTitle")}</div>
              <div className="small" style={{ color: "var(--g1)" }}>{t("momentCard")}</div>
            </div>
            <span>›</span>
          </Link>
        )}
        <p className="proto" style={{ marginTop: 14 }}>{t("allInFoot")}</p>
        {searchParams.ref && <RefCapture code={searchParams.ref} />}
      </main>
    </>
  );
}

/** Store a promoter / referral code from ?ref= so checkout can attribute the order (deep link, brief §4.4). */
function RefCapture({ code }: { code: string }) {
  const c = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return <script dangerouslySetInnerHTML={{ __html: `try{localStorage.setItem('wu-ref',${JSON.stringify(c)});localStorage.setItem('wu-ref-at',new Date().toISOString());fetch('${SUPABASE_URL}/rest/v1/rpc/promoter_click',{method:'POST',headers:{'Content-Type':'application/json','apikey':'${SUPABASE_ANON_KEY}','Authorization':'Bearer ${SUPABASE_ANON_KEY}'},body:JSON.stringify({p_tenant:'${TENANT}',p_code:${JSON.stringify(c)}})}).catch(function(){})}catch(e){}` }} />;
}
