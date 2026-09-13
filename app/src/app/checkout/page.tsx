"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import LoginForm from "@/components/LoginForm";
import { sb } from "@/lib/supabase-browser";
import { FEE_PCT, FEE_FIXED, TENANT, money, lbp } from "@/lib/config";
import { useT } from "@/lib/lang";
import type { Cart } from "../e/[slug]/TierPicker";

const METHODS: [string, string, string][] = [
  ["card", "card", "cardSub"],
  ["whish", "whish", "whishSub"],
  ["omt", "omt", "omtSub"],
  ["cash_door", "cash", "cashSub"],
];
const ERRORS: Record<string, string> = {
  sold_out: "That tier just sold out.",
  per_order_limit: "Max 6 tickets per order.",
  promo_invalid: "Promo code is not valid.",
  table_unavailable: "That table was just taken.",
  unauthenticated: "Please sign in first.",
};

export default function Checkout() {
  const router = useRouter();
  const t = useT();
  const [cart, setCart] = useState<Cart | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [method, setMethod] = useState("card");
  const [promo, setPromo] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      setCart(JSON.parse(sessionStorage.getItem("wu-cart") ?? "null"));
    } catch {}
    sb().auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  if (!cart)
    return (
      <>
        <TopBar back="/" title={t("checkout")} />
        <main><div className="empty">{t("emptyCart")}</div></main>
      </>
    );

  const face = cart.lines.reduce((a, l) => a + l.qty * l.face, 0);
  const fee = cart.lines.reduce((a, l) => a + (l.face === 0 ? 0 : l.qty * (l.face * FEE_PCT + FEE_FIXED)), 0);
  const deposit = cart.table?.deposit ?? 0;
  const discount = pct ? (face * pct) / 100 : 0;
  const total = Math.round((face + fee + deposit - discount) * 100) / 100;
  const reserve = method === "cash_door" || method === "omt";

  const applyPromo = async () => {
    const { data } = await sb().from("promo_codes").select("pct_off,fixed_off").eq("code", promo.toUpperCase()).eq("active", true).maybeSingle();
    if (data) {
      setPct(Number(data.pct_off ?? 0));
      setErr("");
    } else {
      setPct(null);
      setErr(t("badPromo"));
    }
  };

  const pay = async () => {
    setBusy(true);
    setErr("");
    const { data, error } = await sb().functions.invoke("create-order", {
      body: {
        tenant: TENANT,
        event_id: cart.event.id,
        lines: cart.lines.map((l) => ({ tier_id: l.tier_id, qty: l.qty })),
        table_id: cart.table?.id,
        promo_code: pct ? promo : undefined,
        payment_method: method,
        referral_code: localStorage.getItem("wu-ref") ?? undefined,
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
    router.replace(data.tickets?.length ? `/t/${data.tickets[0].code}` : "/tickets");
  };

  return (
    <>
      <TopBar back={`/e/${cart.event.slug}`} title={t("checkout")} />
      <main>
        <div className="card">
          <b>{cart.event.title}</b>
          <div className="note">
            {cart.lines.map((l) => `${l.qty} × ${l.name}`).join(" · ")}
            {cart.table ? ` · ${cart.table.name}` : ""}
          </div>
        </div>
        {user ? (
          <>
            <div className="card stack">
              <div className="label">{t("promo")}</div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="WHATSUP10" disabled={pct !== null} />
                </div>
                <button className="btn ghost sm" onClick={applyPromo} disabled={pct !== null || !promo}>{t("apply")}</button>
              </div>
            </div>
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
            <div className="card lines">
              {cart.lines.map((l) => (
                <div key={l.tier_id} className="line">
                  <span>{l.qty} × {l.name}</span>
                  <span className="num">{money(l.qty * l.face)}</span>
                </div>
              ))}
              {cart.table && (
                <div className="line">
                  <span>{t("tableDep")} · {cart.table.name}</span>
                  <span className="num">{money(deposit)}</span>
                </div>
              )}
              <div className="line">
                <span>{t("fee")} <span className="note">(5% + $0.50)</span></span>
                <span className="num">{money(fee)}</span>
              </div>
              {discount > 0 && (
                <div className="line" style={{ color: "var(--green)" }}>
                  <span>Promo {promo.toUpperCase()}</span>
                  <span className="num">−{money(discount)}</span>
                </div>
              )}
              <div className="line total">
                <span>{t("total")}</span>
                <span className="num">{money(total)}</span>
              </div>
              <div className="note num">≈ {lbp(total)}</div>
            </div>
            {err && <div className="err">{err}</div>}
            <button className={`btn ${reserve ? "green" : "primary"}`} disabled={busy} onClick={pay}>
              {busy ? t("processing") : reserve ? t("reserve") : t("pay")} {money(total)}
            </button>
            <p className="note" style={{ textAlign: "center", margin: 0 }}>{t("sandbox")}</p>
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
