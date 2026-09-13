"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

type Stream = {
  id: string; slug: string; title: string; title_ar: string | null; kind: string; status: string; access: string; pass_price: number;
  venues: { name: string; name_ar: string | null; city: string } | null;
};

export default function LivePage() {
  const t = useT();
  const lang = useLang();
  const [streams, setStreams] = useState<Stream[] | null>(null);

  useEffect(() => {
    sb()
      .from("v_streams")
      .select("*, venues(name,name_ar,city)")
      .in("status", ["live", "offline"])
      .order("status")
      .order("started_at", { ascending: false })
      .then(({ data }) => setStreams((data ?? []) as unknown as Stream[]));
  }, []);

  const live = (streams ?? []).filter((s) => s.status === "live");
  const off = (streams ?? []).filter((s) => s.status !== "live");
  const card = (s: Stream) => (
    <Link key={s.id} href={`/live/${s.slug}`} className="tier" style={{ gridTemplateColumns: "44px 1fr auto" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 20, background: s.status === "live" ? "#FBE3E2" : "var(--sunken)" }}>
        {s.kind === "video" ? "▶" : "♫"}
      </div>
      <div>
        <div className="n">{lang === "ar" && s.title_ar ? s.title_ar : s.title}</div>
        <div className="s">
          {lang === "ar" && s.venues?.name_ar ? s.venues.name_ar : s.venues?.name}
          {s.venues?.city ? ` · ${s.venues.city}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "end" }}>
        {s.status === "live" ? <span className="pill live">● {t("live")}</span> : <span className="pill">{t("offline")}</span>}
        {s.access === "pass" && <div className="s num" style={{ marginTop: 4 }}>{money(Number(s.pass_price))} / 24h</div>}
      </div>
    </Link>
  );

  return (
    <>
      <TopBar />
      <main>
        <div>
          <h2 className="display" style={{ margin: 0, fontSize: 22 }}>{t("liveTitle")}</h2>
          <p className="note" style={{ margin: "4px 0 0" }}>{t("liveSub")}</p>
        </div>
        {streams === null && <div className="empty">{t("loading")}</div>}
        {streams && !streams.length && <div className="empty">{t("noStreams")}</div>}
        {live.length > 0 && (
          <div className="stack">
            <div className="label">{t("onAirNow")}</div>
            {live.map(card)}
          </div>
        )}
        {off.length > 0 && (
          <div className="stack">
            <div className="label">{t("venues")}</div>
            {off.map(card)}
          </div>
        )}
      </main>
    </>
  );
}
