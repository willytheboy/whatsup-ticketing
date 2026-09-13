"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { TZ, fmtTime } from "@/lib/config";
import { artClass } from "@/lib/art";
import { useT } from "@/lib/lang";

type Row = {
  code: string; seat: string | null; state: string; created_at: string;
  events: { id: string; title: string; starts_at: string; venues: { name: string } | null };
  tiers: { name: string } | null;
};

export default function MyTickets() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return setRows([]);
      const { data: tk } = await sb()
        .from("tickets")
        .select("code,seat,state,created_at,events(id,title,starts_at,venues(name)),tiers(name)")
        .order("created_at", { ascending: false });
      setRows((tk ?? []) as unknown as Row[]);
    });
  }, []);

  return (
    <>
      <TopBar />
      <main>
        <div className="row between">
          <h3 className="display" style={{ margin: 0, fontSize: 18 }}>{t("myTickets")}</h3>
          {user && (
            <button className="note" onClick={() => sb().auth.signOut().then(() => location.reload())}>{t("signOut")}</button>
          )}
        </div>
        {user === null && (
          <div className="card stack">
            <p style={{ margin: 0 }}>{t("signInTickets")}</p>
            <Link href="/login?next=/tickets" className="btn green">{t("signIn")}</Link>
          </div>
        )}
        {rows === null ? (
          <div className="empty">{t("loading")}</div>
        ) : rows.length === 0 && user ? (
          <div className="empty">{t("noTickets")}</div>
        ) : (
          <div className="stack">
            {rows.map((r) => {
              const e = r.events;
              const d = new Date(e.starts_at);
              return (
                <Link key={r.code} href={`/t/${r.code}`} className="ev">
                  <div className={`art ${artClass(e.id)}`}>
                    <div className="d num">
                      {Number(d.toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ }))}
                      <small>{d.toLocaleDateString("en-GB", { month: "short", timeZone: TZ })}</small>
                    </div>
                  </div>
                  <div className="meta">
                    <div>
                      <span className={`pill ${r.state === "valid" ? "ok" : r.state === "reserved" ? "gold" : ""}`}>{r.state}</span>
                    </div>
                    <div className="title">{e.title}</div>
                    <div className="sub">
                      {r.tiers?.name}{r.seat ? ` · ${r.seat}` : ""} · {fmtTime(e.starts_at)} · {e.venues?.name}
                    </div>
                    <div className="foot" style={{ letterSpacing: ".12em", fontFamily: "var(--font-display)" }}>{r.code}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
