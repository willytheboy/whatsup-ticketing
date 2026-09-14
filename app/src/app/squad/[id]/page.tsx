"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { money, allInKind, unitFee } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import type { Cart } from "../../e/[slug]/OfferPicker";

type Member = { user_id: string; name: string; paid: boolean; order_id?: string };
type Item = { event_id: string; slug: string; title: string; title_ar?: string | null; tier_id: string; tier: string; kind: string; face: number; qty: number };
type Squad = { id: string; name: string; owner_id: string; members: Member[]; items: Item[] };

/** Squad (brief §5.5): everyone pays their own share. The link goes round on WhatsApp; each friend taps "Pay my share". */
export default function SquadPage({ params }: { params: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [sq, setSq] = useState<Squad | null>(null);
  const load = async () => { const { data } = await sb().from("squads").select("*").eq("id", params.id).maybeSingle(); setSq(data as Squad | null); };
  useEffect(() => { sb().auth.getUser().then(async ({ data }) => { setUser(data.user); if (data.user) { const { data: p } = await sb().from("profiles").select("name").eq("id", data.user.id).maybeSingle(); setName(p?.name ?? ""); } }); load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = sq?.members.find((m) => m.user_id === user?.id);
  const item = sq?.items[0];
  const share = item ? allInKind(item.kind as any, item.face) : 0;
  const link = typeof location !== "undefined" ? `${location.origin}/squad/${params.id}` : "";
  const join = async () => {
    if (!user) return router.push(`/login?next=/squad/${params.id}`);
    const { error } = await sb().rpc("join_squad", { p_id: params.id, p_name: name });
    if (error) return toast(error.message);
    toast(t("joined")); load();
  };
  const payShare = () => {
    if (!item || !user) return join();
    const cart: Cart = { listing: { id: item.event_id, slug: item.slug, title: item.title, kind: "event" }, lines: [{ tier_id: item.tier_id, name: item.tier, kind: item.kind as any, qty: 1, face: item.face, unit: item.face, fee: unitFee(item.kind as any, item.face), covered: false, note: null, plan_months: null }], table: null, gift: null, method: "card", checkin: null, squad_id: params.id };
    sessionStorage.setItem("wu-cart", JSON.stringify(cart));
    router.push("/checkout");
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(`${t("squadInvite")} ${item ? (lang === "ar" && item.title_ar ? item.title_ar : item.title) : ""} · ${money(share)} ${t("each")}\n${link}`)}`;

  return (
    <>
      <TopBar back={item ? `/e/${item.slug}` : "/wallet"} title={t("squad")} />
      <main>
        {!sq && <div className="empty">{t("loading")}</div>}
        {sq && item && (
          <>
            <div className="card pad stack">
              <div className="eyebrow">{sq.name}</div>
              <div className="title" style={{ fontSize: 18 }}>{lang === "ar" && item.title_ar ? item.title_ar : item.title}</div>
              <div className="meta">{item.tier} · {money(share)} {t("each")} · {t("allIn")}</div>
              <div className="small">{t("squadNote")}</div>
            </div>
            <div className="card pad">
              <div className="eyebrow" style={{ marginBottom: 6 }}>{t("whoIsIn")} · {sq.members.length}</div>
              {sq.members.map((m) => <div key={m.user_id} className="row" style={{ padding: "5px 0" }}><span style={{ fontSize: 14 }}>{m.name}{m.user_id === sq.owner_id ? ` · ${t("host")}` : ""}</span><span className={`tag ${m.paid ? "ok" : ""}`}>{m.paid ? t("paid") : t("notYet")}</span></div>)}
            </div>
            {user === null && <Link href={`/login?next=/squad/${params.id}`} className="btn green">{t("signIn")}</Link>}
            {user && !me && <button className="btn green" onClick={join}>{t("joinSquad")}</button>}
            {user && me && !me.paid && <button className="btn red" onClick={payShare}>{t("payMyShare")} · {money(share)}</button>}
            {user && me?.paid && <div className="tag ok" style={{ alignSelf: "center" }}>✓ {t("paid")}</div>}
            <div className="grid2">
              <a className="btn line" href={wa} target="_blank" rel="noopener">{t("sendWa")}</a>
              <button className="btn line" onClick={() => { navigator.clipboard?.writeText(link); toast(t("linkCopied")); }}>{t("copyLink")}</button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
