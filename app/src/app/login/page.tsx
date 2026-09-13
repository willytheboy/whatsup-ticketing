"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import LoginForm from "@/components/LoginForm";
import { useT } from "@/lib/lang";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  return <LoginForm onDone={() => router.replace(params.get("next") ?? "/tickets")} />;
}

export default function LoginPage() {
  const t = useT();
  return (
    <>
      <TopBar back="/" title={t("signIn")} />
      <main>
        <Suspense>
          <Form />
        </Suspense>
      </main>
    </>
  );
}
