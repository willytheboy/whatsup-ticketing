"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { PACKAGES, fmtDate, money } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Ev = { id: string; slug: string; title: string; title_ar: string | null; featured_until: string | null };
type Promo = { id: string; package: string; price: number; status: string; created_at: string };

/** Promote (media revenue): Boost / Story bundle / Takeover. Paid into promotion_orders → ledger; Boost puts the listing first on Home. */
export default function PromotePage({ params }: { params: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { user, org } = useOrg();
  const [ev, setEv] = useState<Ev | null>(null);
  const [orders, setOrders] = useState<Promo[]>([]);
  const [busy, setBusy] = useState("");

  const load = async () => {
    const [{ data: e }, { data: o }] = await Promise.all([
      sb().from("events").select("id,slug,title,title_ar,featured_until").eq("id", params.id).maybeSingle(),
      sb().from("promotion_orders").select("id,package,price,status,created_at").eq("event_id", params.id).order("created_at", { ascending: false }),
    ]);
    setEv(e as Ev | null);
    setOrders((o ?? []) as Promo[]);
  };
  useEffect(() => { load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const buy = async (id: string) => {
    setBusy(id);
    const { error } = await sb().rpc("buy_promotion", { p_event: params.id, p_package: id, p_method: "card" });
    setBusy("");
    if (error) return toast(error.message);
    toast(t("promoted"));
    load();
  };
  const active = ev?.featured_until && new Date(ev.featured_until) > new Date();

  return (
    <>
      <TopBar back="/org" title={t("promoteTitle")} right={ev ? <Link href={`/org/kit/${ev.id}`} className="btn xs line">{t("kit")}</Link> : undefined} />
      <main>
        {ev && <div><div className="title" style={{ fontSize: 18 }}>{lang === "ar" && ev.title_ar ? ev.title_ar : ev.title}</div><p className="meta" style={{ margin: "4px 0 0" }}>{t("promoteSub")}</p></div>}
        {user === null && <Link href={`/login?next=/org/promote/${params.id}`} className="btn green">{t("signIn")}</Link>}
        {active && <div className="moment"><div><div style={{ fontWeight: 600 }}>★ {t("activePromo")}</div><div className="small" style={{ color: "var(--g1)" }}>{t("until")} {fmtDate(ev!.featured_until!)} · <Link href="/" style={{ fontWeight: 600 }}>{t("nHome")} →</Link></div></div></div>}
        {PACKAGES.map((p) => (
          <div key={p.id} className="planbox">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{t(`pk${p.id[0].toUpperCase()}${p.id.slice(1)}`)}</div>
                <div className="price" style={{ marginTop: 4 }}>{money(p.price)}<small> · {p.days} {t("days")}</small></div>
              </div>
              <button className="btn red sm" disabled={!org || !!busy} onClick={() => buy(p.id)}>{busy === p.id ? t("processing") : t("buyPkg")}</button>
            </div>
            <ul>{p.lines.map((l) => <li key={l}>{t(l)}</li>)}</ul>
          </div>
        ))}
        {orders.length > 0 && (
          <div className="card pad">
            <div className="label" style={{ marginBottom: 4 }}>{t("activePromo")}</div>
            {orders.map((o) => <div key={o.id} className="orow"><div><b>{t(`pk${o.package[0].toUpperCase()}${o.package.slice(1)}`)}</b><small>{fmtDate(o.created_at)} · {o.status}</small></div><div className="num" style={{ fontWeight: 700 }}>{money(Number(o.price))}</div></div>)}
          </div>
        )}
        <p className="small" style={{ textAlign: "center" }}>{t("sandbox")}</p>
      </main>
    </>
  );
}
