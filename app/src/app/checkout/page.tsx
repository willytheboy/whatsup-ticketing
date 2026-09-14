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
  const [protect, setProtect] = useState(false);
  const [credit, setCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(true);

  useEffect(() => {
    try {
      const c = JSON.parse(sessionStorage.getItem("wu-cart") ?? "null");
      setCart(c);
      if (c?.method) setMethod(c.method);
    } catch { setCart(null); }
    sb().auth.getUser().then(async ({ data }) => { setUser(data.user); if (data.user) { const { data: p } = await sb().from("profiles").select("credit").eq("id", data.user.id).maybeSingle(); setCredit(Number(p?.credit ?? 0)); } });
  }, []);

  if (cart === undefined) return <><TopBar back="/" title={t("checkout")} /><main><div className="empty">{t("loading")}</div></main></>;
  if (!cart) return <><TopBar back="/" title={t("checkout")} /><main><div className="empty">{t("emptyCart")}</div></main></>;

  const face = cart.lines.reduce((a, l) => a + l.qty * l.unit, 0);
  const fee = cart.lines.reduce((a, l) => a + l.qty * l.fee, 0);
  const deposit = (cart.table?.deposit ?? 0) + (cart.table?.package?.price ?? 0);
  const discount = pct ? r2((face * pct) / 100) : 0;
  const protectable = face > 0 && cart.lines.some((l) => ["ticket", "daypass", "item", "stay"].includes(l.kind));
  const protection = protect && protectable ? r2(Math.max(1, face * 0.08)) : 0;
  const total = r2(face + fee + deposit + protection - discount);
  const creditUsed = useCredit && credit > 0 ? Math.min(credit, total) : 0;
  const due = r2(total - creditUsed);
  const reserve = (method === "cash_door" || method === "omt") && due > 0;
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
        nights: nights ?? null, checkin: cart.checkin, gift: cart.gift, package_id: cart.table?.package?.id ?? null,
        promo_code: pct ? promo : undefined, payment_method: due === 0 && creditUsed > 0 ? "credit" : method, referral_code: ref, referral_at: (() => { try { return localStorage.getItem("wu-ref-at") ?? undefined; } catch { return undefined; } })(),
        refund_protection: protect && protectable, use_credit: useCredit && credit > 0, squad_id: cart.squad_id ?? null,
      },
    });
    setBusy(false);
    if (error || data?.error) {
      const body = await (error as any)?.context?.json?.().catch(() => null);
      const code = body?.error ?? data?.error ?? error?.message;
      setErr(ERRORS[code] ?? `Could not complete: ${code}`);
      return;
    }
    if (data?.next === "pay") { router.replace(`/checkout/pay?order=${data.order_id}`); return; }
    sessionStorage.removeItem("wu-cart");
    router.replace(data.tickets?.length ? `/t/${data.tickets[0].code}?new=1${data.status === "reserved" ? "&reserved=1" : ""}` : "/wallet");
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
            {protectable && (
              <label className="card pad row" style={{ gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} style={{ width: 18, height: 18 }} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>🛡️ {t("refundProtection")}</div><div className="small">{t("refundProtectionNote")}</div></div>
                <b className="num">{money(r2(Math.max(1, face * 0.08)))}</b>
              </label>
            )}
            {credit > 0 && (
              <label className="card sand pad row" style={{ gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} style={{ width: 18, height: 18 }} />
                <div style={{ flex: 1, fontSize: 14 }}>💚 {t("useCredit")} <b className="num">{money(credit)}</b></div>
              </label>
            )}
            {due > 0 && (
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
                <div className="line"><span>{t("tableDep")} · {cart.table.name}{cart.table.package ? ` · ${cart.table.package.name}` : ""}</span><span className="num">{money(deposit)}</span></div>
              )}
              {protection > 0 && <div className="line"><span>{t("refundProtection")}</span><span className="num">{money(protection)}</span></div>}
              {fee > 0 && (
                <div className="line"><span>{t("fee")}</span><span className="num">{money(fee)}</span></div>
              )}
              {discount > 0 && (
                <div className="line" style={{ color: "var(--g1)" }}><span>Promo {promo.toUpperCase()}</span><span className="num">−{money(discount)}</span></div>
              )}
              {creditUsed > 0 && <div className="line" style={{ color: "var(--g1)" }}><span>{t("fanCredit")}</span><span className="num">−{money(creditUsed)}</span></div>}
              <div className="line total"><span>{t("total")}</span><span className="num">{due ? money(due) : total ? `${money(0)} · ${t("coveredByCredit")}` : t("free")}</span></div>
              {due > 0 && <div className="note num">≈ {lbp(due)}</div>}
            </div>
            {err && <div className="err">{err}</div>}
            <button className={`btn ${reserve ? "green" : "red"} full`} disabled={busy} onClick={pay}>
              {busy ? t("processing") : due === 0 ? (cart.table ? t("confirm") : creditUsed ? t("pay") : t("reserve")) : reserve ? t("reserve") : t("pay")} {due ? money(due) : ""}
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
