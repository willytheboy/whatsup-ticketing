"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { FeatureOff, useFeature } from "@/components/Config";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { TENANT } from "@/lib/config";
import { useT } from "@/lib/lang";

/** Your moment (brief §5.11): dashed upload area, caption, credit, send. Lands in the private `moments` bucket for the editors. */
export default function MomentPage() {
  const t = useT();
  const featureOn = useFeature("moments");
  const toast = useToast();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { sb().auth.getUser().then(({ data }) => setUser(data.user)); }, []);
  if (!featureOn) return <FeatureOff back="/" />;

  const pick = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : "");
  };
  const send = async () => {
    if (!user || !file) return;
    setBusy(true);
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await sb().storage.from("moments").upload(path, file, { contentType: file.type });
    if (error) { setBusy(false); return toast(error.message); }
    const { data: tenant } = await sb().from("tenants").select("id").eq("slug", TENANT).maybeSingle();
    await sb().from("moments").insert({ tenant_id: tenant?.id ?? null, user_id: user.id, path, caption: caption || null, credit: credit || null });
    setBusy(false);
    setSent(true);
    toast(t("sentMoment"));
  };

  return (
    <>
      <TopBar eyebrow={t("moment")} sub={t("momentSub")} />
      <main style={{ paddingTop: 6 }}>
        <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <button className="card" style={{ width: "100%", height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--ink3)", borderStyle: "dashed", position: "relative", overflow: "hidden" }} onClick={() => input.current?.click()}>
          {preview ? (file?.type.startsWith("video") ? <video src={preview} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} muted /> : <img src={preview} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />) : (
            <><span style={{ fontSize: 36 }}>📷</span><span style={{ fontSize: 14 }}>{t("addPhoto")}</span></>
          )}
        </button>
        <div className="field"><label>{t("caption")}</label><input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Batroun, 6:40 pm" /></div>
        <div className="field"><label>{t("creditMe")}</label><input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="@yourhandle" /></div>
        {user === null ? (
          <Link href="/login?next=/moment" className="btn green full">{t("signIn")}</Link>
        ) : sent ? (
          <div className="moment"><div style={{ fontWeight: 600 }}>✓ {t("sentMoment")}</div></div>
        ) : (
          <button className="btn green full" disabled={!file || busy} onClick={send}>{busy ? t("processing") : t("sendMoment")}</button>
        )}
      </main>
    </>
  );
}
