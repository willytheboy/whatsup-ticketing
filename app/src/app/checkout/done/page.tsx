"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

/** Return page after a hosted checkout: waits for the payment webhook to issue the tickets, then opens the first one. */
function DoneInner() {
  const t = useT();
  const sp = useSearchParams();
  const router = useRouter();
  const orderId = sp.get("order") ?? "";
  const [tries, setTries] = useState(0);
  const [status, setStatus] = useState<string>("pending");
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    const poll = async () => {
      const { data } = await sb().from("orders").select("status").eq("id", orderId).maybeSingle();
      if (!alive) return;
      setStatus(data?.status ?? "pending");
      if (data?.status === "paid") {
        const { data: tk } = await sb().from("tickets").select("code").eq("order_id", orderId).limit(1);
        sessionStorage.removeItem("wu-cart");
        router.replace(tk?.[0]?.code ? `/t/${tk[0].code}?new=1` : "/wallet");
        return;
      }
      if (tries < 20) setTimeout(() => { setTries((n) => n + 1); poll(); }, 2000);
    };
    poll();
    return () => { alive = false; };
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TopBar back="/wallet" title={t("checkout")} />
      <main>
        <div className="card pad stack" style={{ textAlign: "center" }}>
          {status === "paid" ? <div className="tag ok">{t("done")}</div> : tries < 20 ? <><div style={{ fontSize: 28 }}>⏳</div><div className="small">{t("confirming")}</div></> : <><div className="small">{t("stillConfirming")}</div><Link href="/wallet" className="btn line">{t("wallet")}</Link></>}
        </div>
      </main>
    </>
  );
}
export default function DonePage() { return <Suspense><DoneInner /></Suspense>; }
