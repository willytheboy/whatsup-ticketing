"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import LoginForm from "@/components/LoginForm";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

/** A transferred ticket lands here from the WhatsApp link: sign in (or up) and the ticket attaches to this account. */
export default function ClaimPage({ params }: { params: { code: string } }) {
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState<any>(undefined);
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => { sb().auth.getUser().then(({ data }) => setUser(data.user)); }, []);
  const claim = async () => {
    setState("busy");
    const { data, error } = await sb().functions.invoke("wallet", { body: { action: "claim", claim_code: params.code } });
    const err = data?.error ?? (error ? (await (error as any)?.context?.json?.().catch(() => null))?.error ?? error.message : null);
    if (err) { setState("err"); setMsg(err === "claimed" ? t("claimTaken") : t("claimBad")); return; }
    setState("ok"); setTimeout(() => router.replace(`/t/${data.code}?new=1`), 600);
  };
  useEffect(() => { if (user && state === "idle") claim(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TopBar back="/wallet" title={t("claimTitle")} />
      <main>
        <div className="card pad stack">
          <div style={{ fontSize: 16, fontWeight: 600 }}>🎟️ {t("claimTitle")}</div>
          <div className="small">{t("claimNote")} <b className="num">{params.code}</b></div>
          {user === null && <LoginForm onDone={() => sb().auth.getUser().then(({ data }) => setUser(data.user))} />}
          {state === "busy" && <div className="small">{t("processing")}</div>}
          {state === "ok" && <div className="tag ok">{t("claimed")}</div>}
          {state === "err" && <><div className="err">{msg}</div><Link href="/wallet" className="btn line">{t("wallet")}</Link></>}
        </div>
      </main>
    </>
  );
}
