"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import Band from "@/components/Band";
import LoginForm from "@/components/LoginForm";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/wallet";
  // Already signed in (or just back from an email confirmation link): go straight on. A reset link stays here for the new password.
  useEffect(() => {
    if (params.has("reset")) return;
    sb().auth.getSession().then(({ data }) => { if (data.session) router.replace(next); });
    const { data: sub } = sb().auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") router.replace(next); });
    return () => sub.subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <LoginForm onDone={() => router.replace(next)} />;
}

/** Sign in: WhatsApp OTP first when phone auth is on; email until then (brief §2.10 — booking is where identity is asked). */
export default function LoginPage() {
  const t = useT();
  return (
    <>
      <TopBar back="/" title={t("signIn")} />
      <Band h={72} top={t("wm1")} main={t("country")} />
      <main>
        <Suspense>
          <Form />
        </Suspense>
      </main>
    </>
  );
}
