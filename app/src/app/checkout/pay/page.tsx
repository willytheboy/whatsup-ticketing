"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useT } from "@/lib/lang";

/** Live payments: hands the buyer to the provider's hosted checkout (or settles the sandbox order) and shows the state on return. */
function PayInner() {
  const t = useT();
  const sp = useSearchParams();
  const router = useRouter();
  const orderId = sp.get("order") ?? "";
  const [order, setOrder] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(sp.get("failed") ? t("payFailed") : sp.get("cancelled") ? t("payCancelled") : "");
  useEffect(() => { if (orderId) sb().from("orders").select("id,status,total,credit_used,payment_method,events(title,slug)").eq("id", orderId).maybeSingle().then(({ data }) => { setOrder(data); if (data?.status === "paid") router.replace(`/checkout/done?order=${orderId}`); }); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setBusy(true); setErr("");
    const { data, error } = await sb().functions.invoke("pay", { body: { order_id: orderId } });
    setBusy(false);
    const e = data?.error ?? (error ? (await (error as any)?.context?.json?.().catch(() => null))?.error ?? error.message : null);
    if (e) return setErr(e === "provider_not_configured" ? t("payNotReady") : `${t("payFailed")} (${e})`);
    if (data?.checkout_url) { location.href = data.checkout_url; return; }
    if (data?.status === "paid") router.replace(`/checkout/done?order=${orderId}`);
  };
  const due = order ? Math.round((Number(order.total) - Number(order.credit_used ?? 0)) * 100) / 100 : 0;
  return (
    <>
      <TopBar back="/wallet" title={t("pay")} />
      <main>
        {!order && <div className="empty">{t("loading")}</div>}
        {order && (
          <div className="card pad stack">
            <b>{order.events?.title}</b>
            <div className="meta">{t("total")} {money(Number(order.total))}{Number(order.credit_used) ? ` · ${t("fanCredit")} −${money(Number(order.credit_used))}` : ""}</div>
            {err && <div className="err">{err}</div>}
            {order.status === "pending" && <button className="btn red full" disabled={busy} onClick={start}>{busy ? t("processing") : `${t("pay")} ${money(due)}`}</button>}
            {order.status !== "pending" && order.status !== "paid" && <div className="tag">{t(order.status)}</div>}
            <Link href={`/e/${order.events?.slug ?? ""}`} className="btn line">{t("back")}</Link>
          </div>
        )}
      </main>
    </>
  );
}
export default function PayPage() { return <Suspense><PayInner /></Suspense>; }
