"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import LoginForm from "@/components/LoginForm";
import { sb } from "@/lib/supabase-browser";
import { TENANT, money, lbp, r2 } from "@/lib/config";
import { useT } from "@/lib/lang";
import type { Cart } from "../e/[slug]/OfferPicker";

const METHODS: [string, string, string][] = [
  ["card", "card", "cardSub"],
  ["whish", "whish", "whishSub"],
  ["omt", "omt", "omtSub"],
  ["cash_door", "cash", "cashSub"],
];
const ERRORS: Record<string, string> = {
  sold_out: "That one just sold out.",
  per_order_limit: "Above the per-order limit.",
  promo_invalid: "Promo code is not valid.",
  table_unavailable: "That table was just taken.",
  unauthenticated: "Please sign in first.",
  event_unavailable: "This listing is not on sale right now.",
};

/** Checkout: the cart from the listing, sign-in if needed, promo, payment method (cash is a peer of card), total all-in. */
export default function Checkout() {
  const router = useRouter();
  const t = useT();
  const [cart, setCart] = useState<Cart | null | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [method, setMethod] = useState("card");
  const [promo, setPromo] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const c = JSON.parse(sessionStorage.getItem("wu-cart") ?? "null");
      setCart(c);
      if (c?.method) setMethod(c.method);
    } catch { setCart(null); }
    sb().auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  if (cart === undefined) return <><TopBar back="/" title={t("checkout")} /><main><div className="empty">{t("loading")}</div></main></>;
  if (!cart) return <><TopBar back="/" title={t("checkout")} /><main><div className="empty">{t("emptyCart")}</div></main></>;

  const face = cart.lines.reduce((a, l) => a + l.qty * l.unit, 0);
  const fee = cart.lines.reduce((a, l) => a + l.qty * l.fee, 0);
  const deposit = cart.table?.deposit ?? 0;
  const discount = pct ? r2((face * pct) / 100) : 0;
  const total = r2(face + fee + deposit - discount);
  const reserve = method === "cash_door" || method === "omt";
  const nights = cart.lines.find((l) => l.kind === "stay")?.qty;

  const applyPromo = async () => {
    const { data } = await sb().from("promo_codes").select("pct_off,fixed_off").eq("code", promo.toUpperCase()).eq("active", true).maybeSingle();
    if (data) { setPct(Number(data.pct_off ?? 0)); setErr(""); } else { setPct(null); setErr(t("badPromo")); }
  };

  const pay = async () => {
    setBusy(true);
    setErr("");
    let ref: string | undefined;
    try { ref = localStorage.getItem("wu-ref") ?? undefined; } catch {}
    const { data, error } = await sb().functions.invoke("create-order", {
      body: {
        tenant: TENANT, event_id: cart.listing.id,
        lines: cart.lines.map((l) => ({ tier_id: l.tier_id, qty: l.qty })),
        table_id: cart.table?.id, party: cart.table?.party ?? null, time: cart.table?.time ?? null,
        nights: nights ?? null, checkin: cart.checkin, gift: cart.gift,
        promo_code: pct ? promo : undefined, payment_method: method, referral_code: ref,
      },
    });
    setBusy(false);
    if (error || data?.error) {
      const body = await (error as any)?.context?.json?.().catch(() => null);
      const code = body?.error ?? data?.error ?? error?.message;
      setErr(ERRORS[code] ?? `Could not complete: ${code}`);
      return;
    }
    sessionStorage.removeItem("wu-cart");
    router.replace(data.tickets?.length ? `/t/${data.tickets[0].code}?new=1` : "/wallet");
  };

  return (
    <>
      <TopBar back={`/e/${cart.listing.slug}`} title={t("checkout")} />
      <main>
        <div className="card pad">
          <b>{cart.listing.title}</b>
          <div className="meta">
            {cart.lines.map((l) => `${l.qty} × ${l.name}${l.kind === "stay" ? ` (${t("nights")})` : ""}`).join(" · ")}
            {cart.table ? `${cart.lines.length ? " · " : ""}${cart.table.name}${cart.table.party ? ` · ${cart.table.party}` : ""}${cart.table.time ? ` · ${cart.table.time}` : ""}` : ""}
          </div>
          {cart.gift && <div className="small" style={{ marginTop: 4 }}>🎁 {t("giftedTo")} {cart.gift.name}{cart.gift.phone ? ` · ${cart.gift.phone}` : ""}</div>}
        </div>
        {user ? (
          <>
            <div className="card pad stack">
              <div className="label">{t("promo")}</div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="WHATSUP10" disabled={pct !== null} />
                </div>
                <button className="btn line sm" onClick={applyPromo} disabled={pct !== null || !promo}>{t("apply")}</button>
              </div>
            </div>
            {total > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>{t("payWith")}</div>
                <div className="pay">
                  {METHODS.map(([id, label, sub]) => (
                    <button key={id} className={`pm ${method === id ? "on" : ""}`} onClick={() => setMethod(id)}>
                      <b>{t(label)}</b>
                      <small>{t(sub)}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="card pad lines">
              {cart.lines.map((l) => (
                <div key={l.tier_id} className="line">
                  <span>{l.qty} × {l.name}{l.covered ? <span className="small" style={{ color: "var(--g1)" }}> · {t("youAreMember")}</span> : ""}</span>
                  <span className="num">{money(l.qty * l.unit)}</span>
                </div>
              ))}
              {cart.table && (
                <div className="line"><span>{t("tableDep")} · {cart.table.name}</span><span className="num">{money(deposit)}</span></div>
              )}
              {fee > 0 && (
                <div className="line"><span>{t("fee")}</span><span className="num">{money(fee)}</span></div>
              )}
              {discount > 0 && (
                <div className="line" style={{ color: "var(--g1)" }}><span>Promo {promo.toUpperCase()}</span><span className="num">−{money(discount)}</span></div>
              )}
              <div className="line total"><span>{t("total")}</span><span className="num">{total ? money(total) : t("free")}</span></div>
              {total > 0 && <div className="note num">≈ {lbp(total)}</div>}
            </div>
            {err && <div className="err">{err}</div>}
            <button className={`btn ${reserve ? "green" : "red"} full`} disabled={busy} onClick={pay}>
              {busy ? t("processing") : total === 0 ? (cart.table ? t("confirm") : t("reserve")) : reserve ? t("reserve") : t("pay")} {total ? money(total) : ""}
            </button>
            <p className="small" style={{ textAlign: "center", margin: 0 }}>{t("sandbox")}</p>
          </>
        ) : (
          <>
            <div className="label">{t("account")}</div>
            <LoginForm onDone={() => sb().auth.getUser().then(({ data }) => setUser(data.user))} />
          </>
        )}
      </main>
    </>
  );
}
