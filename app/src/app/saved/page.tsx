import Link from "next/link";
import TopBar from "@/components/TopBar";
import { SmallCard } from "@/components/Cards";
import { sbUser } from "@/lib/supabase-server";
import { getLang, T } from "@/lib/lang-server";
import { LIST_SELECT, type Listing } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

/** Saved listings (the heart on a listing). */
export default async function SavedPage() {
  const lang = getLang();
  const t = (k: string) => T(lang, k);
  const db = sbUser();
  const { data: { user } } = await db.auth.getUser();
  const { data } = user ? await db.from("saved_listings").select(`event_id, events(${LIST_SELECT})`).eq("user_id", user.id).order("created_at", { ascending: false }) : { data: [] as any[] };
  const list = ((data ?? []) as any[]).map((r) => r.events).filter(Boolean) as Listing[];
  return (
    <>
      <TopBar back="/profile" title={t("savedListings")} />
      <main>
        {!user && <div className="card pad stack"><p style={{ margin: 0 }}>{t("signInFirst")}</p><Link href="/login?next=/saved" className="btn green">{t("signIn")}</Link></div>}
        {user && !list.length && <div className="empty">{t("noSaved")}</div>}
        {list.length > 0 && <div className="grid2">{list.map((l) => <SmallCard key={l.id} l={l} lang={lang} />)}</div>}
      </main>
    </>
  );
}
