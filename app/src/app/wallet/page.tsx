"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { TicketCard, MemberCard, CouponCard, kindOf, isPast, type WalletTicket, type Coupon } from "@/components/TicketCard";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useT } from "@/lib/lang";
import { WALLET_SELECT as SELECT } from "@/lib/walletSelect";
import { ensureKeys } from "@/lib/wallet";

/** Wallet (brief §5.5): passes first, then upcoming, then coupons, then past (collapsed). Live QR codes rotate on device. */
export default function Wallet() {
  const t = useT();
  const toast = useToast();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [credit, setCredit] = useState(0);
  const [rows, setRows] = useState<WalletTicket[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showPast, setShowPast] = useState(false);

  const load = async () => {
    const { data: { user } } = await sb().auth.getUser();
    setUser(user);
    if (!user) return setRows([]);
    const [{ data: tk }, { data: p }, { data: sd }] = await Promise.all([
      sb().from("tickets").select(SELECT).order("created_at", { ascending: false }),
      sb().from("profiles").select("name,credit").eq("id", user.id).maybeSingle(),
      sb().from("saved_deals").select("event_id,deal_id,code,redeemed_at,events(slug,title,title_ar,deals)").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    const list = (tk ?? []) as unknown as WalletTicket[];
    setRows(list);
    setName(p?.name ?? user.email ?? "");
    setCredit(Number(p?.credit ?? 0));
    setCoupons((sd ?? []) as unknown as Coupon[]);
    const live = list.filter((r) => r.state === "valid" || kindOf(r) === "pass").map((r) => r.id);
    if (live.length && navigator.onLine) ensureKeys(live).then(setKeys);
    else { try { setKeys(JSON.parse(localStorage.getItem("wu-rotkeys") ?? "{}")); } catch {} }
  };
  useEffect(() => { load(); }, []);

  const redeem = async (c: Coupon) => {
    if (!user) return;
    await sb().from("saved_deals").update({ redeemed_at: new Date().toISOString() }).eq("user_id", user.id).eq("event_id", c.event_id).eq("deal_id", c.deal_id);
    setCoupons((s) => s.map((x) => (x === c ? { ...x, redeemed_at: new Date().toISOString() } : x)));
    toast(`${t("redeem")} ✓ ${c.code}`);
  };

  const all = rows ?? [];
  const passes = all.filter((r) => kindOf(r) === "pass" && (!r.valid_until || new Date(r.valid_until) > new Date()));
  const upcoming = all.filter((r) => !passes.includes(r) && !isPast(r) && ["valid", "reserved", "resale", "scanned"].includes(r.state)).sort((a, b) => new Date(a.events?.starts_at ?? 0).getTime() - new Date(b.events?.starts_at ?? 0).getTime());
  const past = all.filter((r) => !passes.includes(r) && !upcoming.includes(r));

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
        {credit > 0 && <div className="card sand pad row"><span style={{ fontSize: 14 }}>💚 {t("fanCredit")}</span><b className="num">{money(credit)}</b></div>}
        {rows && user && !rows.length && !coupons.length && (
          <div>
            <p style={{ fontSize: 14, color: "var(--ink2)" }}>{t("noWallet")}</p>
            <Link href="/" className="btn red">{t("browse")}</Link>
          </div>
        )}
        {passes.map((r) => <MemberCard key={r.id} tk={r} holder={name} rotKey={keys[r.id]} />)}
        {upcoming.length > 0 && <div className="eyebrow">{t("upcoming")}</div>}
        {upcoming.map((r) => <TicketCard key={r.id} tk={r} holder={name} rotKey={keys[r.id]} onChange={load} />)}
        {coupons.map((c) => <CouponCard key={`${c.event_id}-${c.deal_id}`} c={c} onRedeem={redeem} />)}
        {past.length > 0 && (
          <>
            <button className="btn line sm" onClick={() => setShowPast((v) => !v)}>{t("past")} · {past.length} {showPast ? "▴" : "▾"}</button>
            {showPast && past.map((r) => <TicketCard key={r.id} tk={r} holder={name} compact />)}
          </>
        )}
        {rows && rows.length > 0 && <p className="small" style={{ textAlign: "center" }}>{t("showQr")}</p>}
      </main>
    </>
  );
}
