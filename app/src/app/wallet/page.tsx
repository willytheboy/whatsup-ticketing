"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { TicketCard, MemberCard, CouponCard, kindOf, type WalletTicket, type Coupon } from "@/components/TicketCard";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

const SELECT = "code,token,seat,state,created_at,valid_until,events(id,slug,title,title_ar,starts_at,kind,venues(name,name_ar,city,city_ar)),tiers(name,name_ar,kind,plan_months,note),orders(meta,total,payment_method)";

/** Wallet (brief §5.5): passes first, then everything else newest first, then saved deals. */
export default function Wallet() {
  const t = useT();
  const toast = useToast();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<WalletTicket[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  useEffect(() => {
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return setRows([]);
      const [{ data: tk }, { data: p }, { data: sd }] = await Promise.all([
        sb().from("tickets").select(SELECT).order("created_at", { ascending: false }),
        sb().from("profiles").select("name").eq("id", data.user.id).maybeSingle(),
        sb().from("saved_deals").select("event_id,deal_id,code,redeemed_at,events(slug,title,title_ar,deals)").eq("user_id", data.user.id).order("created_at", { ascending: false }),
      ]);
      setRows((tk ?? []) as unknown as WalletTicket[]);
      setName(p?.name ?? data.user.email ?? "");
      setCoupons((sd ?? []) as unknown as Coupon[]);
    });
  }, []);

  const redeem = async (c: Coupon) => {
    if (!user) return;
    await sb().from("saved_deals").update({ redeemed_at: new Date().toISOString() }).eq("user_id", user.id).eq("event_id", c.event_id).eq("deal_id", c.deal_id);
    setCoupons((s) => s.map((x) => (x === c ? { ...x, redeemed_at: new Date().toISOString() } : x)));
    toast(`${t("redeem")} ✓ ${c.code}`);
  };

  const passes = (rows ?? []).filter((r) => kindOf(r) === "pass" && (!r.valid_until || new Date(r.valid_until) > new Date()));
  const others = (rows ?? []).filter((r) => !passes.includes(r));

  return (
    <>
      <TopBar eyebrow={t("wallet")} right={user ? <button className="small" onClick={() => sb().auth.signOut().then(() => location.reload())}>{t("signOut")}</button> : undefined} />
      <main style={{ paddingTop: 8 }}>
        {user === null && (
          <div className="card pad stack">
            <p style={{ margin: 0, fontSize: 14 }}>{t("signInTickets")}</p>
            <Link href="/login?next=/wallet" className="btn green">{t("signIn")}</Link>
          </div>
        )}
        {rows === null && user !== null && <div className="empty">{t("loading")}</div>}
        {rows && user && !rows.length && !coupons.length && (
          <div>
            <p style={{ fontSize: 14, color: "var(--ink2)" }}>{t("noWallet")}</p>
            <Link href="/" className="btn red">{t("browse")}</Link>
          </div>
        )}
        {passes.map((r) => <MemberCard key={r.code} tk={r} holder={name} />)}
        {others.map((r) => <TicketCard key={r.code} tk={r} holder={name} />)}
        {coupons.map((c) => <CouponCard key={`${c.event_id}-${c.deal_id}`} c={c} onRedeem={redeem} />)}
        {rows && rows.length > 0 && <p className="small" style={{ textAlign: "center" }}>{t("showQr")}</p>}
      </main>
    </>
  );
}
