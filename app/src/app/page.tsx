import Link from "next/link";
import TopBar from "@/components/TopBar";
import { sbServer } from "@/lib/supabase-server";
import { TENANT, TZ, allIn, money, fmtTime } from "@/lib/config";
import { artClass } from "@/lib/art";
import { getLang, T } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

type Tier = { face_price: number; capacity: number; sold: number; held: number };
type Venue = { name: string; name_ar: string | null; city: string; city_ar: string | null };
type EventRow = {
  id: string; slug: string; title: string; title_ar: string | null; category: string; starts_at: string;
  venues: Venue | null; tiers: Tier[];
};

const FILTERS = ["all", "today", "tomorrow", "weekend"] as const;

/** Calendar date (YYYY-MM-DD) of an instant in the tenant time zone. */
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

function inFilter(startsAt: string, f: string, now: Date) {
  if (f === "all") return true;
  const day = dayOf(new Date(startsAt));
  if (f === "today") return day === dayOf(now);
  if (f === "tomorrow") return day === dayOf(addDays(now, 1));
  // weekend: the coming Friday to Sunday (today included when it is already the weekend)
  const wd = new Date(now.toLocaleString("en-US", { timeZone: TZ })).getDay(); // 0 Sun … 6 Sat
  const toFri = wd === 0 ? -2 : wd === 6 ? -1 : 5 - wd;
  const days = [0, 1, 2].map((i) => dayOf(addDays(now, toFri + i)));
  return days.includes(day);
}

export default async function Discover({ searchParams }: { searchParams: { q?: string; f?: string } }) {
  const lang = getLang();
  const t = (k: string) => T(lang, k);
  const f = FILTERS.includes(searchParams.f as any) ? (searchParams.f as string) : "all";
  const q = (searchParams.q ?? "").trim();
  const now = new Date();

  const db = sbServer();
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", TENANT).maybeSingle();
  let query = db
    .from("events")
    .select("id,slug,title,title_ar,category,starts_at,venues(name,name_ar,city,city_ar),tiers(face_price,capacity,sold,held)")
    .in("status", ["live", "sold_out"])
    .gte("starts_at", addDays(now, -1).toISOString())
    .order("starts_at");
  if (tenant) query = query.eq("tenant_id", tenant.id);
  const { data } = await query;
  const events = ((data ?? []) as unknown as EventRow[]).filter((e) => {
    if (!inFilter(e.starts_at, f, now)) return false;
    if (!q) return true;
    const hay = [e.title, e.title_ar, e.venues?.name, e.venues?.name_ar, e.venues?.city, e.venues?.city_ar, e.category].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <TopBar />
      <main>
        <form className="field" action="/">
          <input name="q" defaultValue={q || undefined} placeholder={t("search")} aria-label="Search" />
        </form>
        <div className="chips">
          {FILTERS.map((k) => (
            <Link key={k} href={`/?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`chip ${f === k ? "on" : ""}`}>
              {t(k)}
            </Link>
          ))}
        </div>
        <div className="row between">
          <h3 className="display" style={{ margin: 0, fontSize: 18 }}>{t("soon")}</h3>
          <span className="note">{events.length} {t("events")}</span>
        </div>
        {events.length === 0 ? (
          <div className="empty">{t("nothing")}</div>
        ) : (
          <div className="stack">
            {events.map((e) => {
              const d = new Date(e.starts_at);
              const open = e.tiers.filter((x) => x.capacity - x.sold - x.held > 0);
              const left = e.tiers.reduce((a, x) => a + Math.max(0, x.capacity - x.sold - x.held), 0);
              const minFace = open.length ? Math.min(...open.map((x) => Number(x.face_price))) : null;
              const venue = lang === "ar" && e.venues?.name_ar ? e.venues.name_ar : e.venues?.name;
              const city = lang === "ar" && e.venues?.city_ar ? e.venues.city_ar : e.venues?.city;
              return (
                <Link key={e.id} href={`/e/${e.slug}`} className="ev">
                  <div className={`art ${artClass(e.id)}`}>
                    <div className="d num">
                      {Number(d.toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ }))}
                      <small>{d.toLocaleDateString("en-GB", { month: "short", timeZone: TZ })}</small>
                    </div>
                  </div>
                  <div className="meta">
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <span className="pill">{e.category}</span>
                      {left > 0 && left <= 50 ? <span className="pill gold">{left} {t("left")}</span> : null}
                    </div>
                    <div className="title">{lang === "ar" && e.title_ar ? e.title_ar : e.title}</div>
                    <div className="sub">{fmtTime(e.starts_at)} · {venue}, {city}</div>
                    <div className="foot num">
                      {minFace === null ? (
                        t("soldOut")
                      ) : minFace === 0 ? (
                        t("free")
                      ) : (
                        <>
                          <small>{t("from")} </small>
                          {money(allIn(minFace))}
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <p className="proto">{t("allInFoot")}</p>
      </main>
    </>
  );
}
