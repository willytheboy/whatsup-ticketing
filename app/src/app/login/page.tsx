"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import Band from "@/components/Band";
import LoginForm from "@/components/LoginForm";
import { useT } from "@/lib/lang";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  return <LoginForm onDone={() => router.replace(params.get("next") ?? "/wallet")} />;
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
