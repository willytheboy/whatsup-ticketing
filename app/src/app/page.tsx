import Link from "next/link";
import Band from "@/components/Band";
import CityPill from "@/components/CityPill";
import PassPromo from "@/components/PassPromo";
import { BigCard, SmallCard } from "@/components/Cards";
import { I } from "@/components/Icons";
import { sbServer } from "@/lib/supabase-server";
import { TENANT, RAIL, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { getLang, getCity, T } from "@/lib/lang-server";
import { LIST_SELECT, inRail, isFeatured, type Listing } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

/** Home (brief §5.1): the feed is the box office. Facet band, city pill, category rail, one featured card, a two-column grid,
    the pass promo when the user holds no pass, and the #WeAreLebanon card. */
export default async function Home({ searchParams }: { searchParams: { c?: string; ref?: string } }) {
  const lang = getLang();
  const t = (k: string) => T(lang, k);
  const city = getCity();
  const rail = RAIL.some(([k]) => k === searchParams.c) ? (searchParams.c as string) : "all";
  const now = new Date();
  const db = sbServer();
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", TENANT).maybeSingle();
  let q = db.from("events").select(LIST_SELECT).in("status", ["live", "sold_out"]).or(`kind.neq.event,starts_at.gte.${new Date(now.getTime() - 864e5).toISOString()}`).order("starts_at");
  if (tenant) q = q.eq("tenant_id", tenant.id);
  const [{ data }, { data: tenants }, { data: { user } }] = await Promise.all([q, db.from("tenants").select("slug,name,country,country_ar,live").order("live", { ascending: false }), db.auth.getUser()]);
  const all = (data ?? []) as unknown as Listing[];
  // For you: categories the signed-in user bought or saved before, minus what they already hold
  let forYou: Listing[] = [];
  if (user) {
    const [{ data: mine }, { data: saved }] = await Promise.all([
      db.from("orders").select("event_id,events(category,kind)").eq("buyer_id", user.id).in("status", ["paid", "reserved"]).limit(50),
      db.from("saved_listings").select("event_id,events(category,kind)").eq("user_id", user.id).limit(50),
    ]);
    const seen = new Set((mine ?? []).map((o: any) => o.event_id));
    const cats = new Map<string, number>();
    for (const r of [...(mine ?? []), ...(saved ?? [])] as any[]) { const c = r.events?.category; if (c) cats.set(c, (cats.get(c) ?? 0) + 1); }
    if (cats.size) forYou = all.filter((l) => !seen.has(l.id) && cats.has(l.category)).sort((a, b) => (cats.get(b.category) ?? 0) - (cats.get(a.category) ?? 0) || a.starts_at.localeCompare(b.starts_at)).slice(0, 6);
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
            <div className="row between" style={{ marginBottom: 6 }}><span className="eyebrow">{t("forYou")}</span><Link href="/saved" className="small" style={{ color: "var(--g1)", fontWeight: 600 }}>{t("savedListings")} →</Link></div>
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
        <Link href="/moment" className="moment" style={{ marginTop: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>📷 {t("momentTitle")}</div>
            <div className="small" style={{ color: "var(--g1)" }}>{t("momentCard")}</div>
          </div>
          <span>›</span>
        </Link>
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
