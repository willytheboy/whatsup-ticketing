"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { TicketCard, MemberCard, kindOf, type WalletTicket } from "@/components/TicketCard";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

const SELECT = "code,token,seat,state,created_at,valid_until,events(id,slug,title,title_ar,starts_at,kind,venues(name,name_ar,city,city_ar)),tiers(name,name_ar,kind,plan_months,note),orders(meta,total,payment_method)";

/** One ticket, straight after checkout or from a shared link (the holder must be signed in). */
function TicketInner({ params }: { params: { code: string } }) {
  const t = useT();
  const toast = useToast();
  const sp = useSearchParams();
  const [tk, setTk] = useState<WalletTicket | null>(null);
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");

  useEffect(() => {
    (async () => {
      const { data } = await sb().from("tickets").select(SELECT).eq("code", params.code).maybeSingle();
      setTk(data as unknown as WalletTicket | null);
      setState(data ? "ok" : "none");
      const { data: { user } } = await sb().auth.getUser();
      if (user) { const { data: p } = await sb().from("profiles").select("name").eq("id", user.id).maybeSingle(); setName(p?.name ?? user.email ?? ""); }
      if (data && sp.get("new")) toast(data.state === "reserved" ? `${t("reserved")}. ${t("done")}` : t("done"));
    })();
  }, [params.code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar back="/wallet" title={t("yourTicket")} />
      <main>
        {state === "loading" && <div className="empty">{t("loading")}</div>}
        {state === "none" && <div className="empty">{t("notFound")}</div>}
        {tk && (kindOf(tk) === "pass" ? <MemberCard tk={tk} holder={name} /> : <TicketCard tk={tk} holder={name} />)}
      </main>
    </>
  );
}

export default function TicketPage({ params }: { params: { code: string } }) {
  return <Suspense><TicketInner params={params} /></Suspense>;
}
