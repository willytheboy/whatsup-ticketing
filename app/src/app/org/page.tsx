"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { money, fmtDate } from "@/lib/config";
import { useT } from "@/lib/lang";
import { useRoles } from "@/lib/roles";

type Stat = { event_id: string; title: string; starts_at: string; status: string; capacity: number; sold: number; gross: number; checked_in: number };
type Payout = { id: string; period_start: string; period_end: string; status: string; amount: number };

export default function OrganiserHub() {
  const t = useT();
  const roles = useRoles();
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return setStats([]);
      const [{ data: s }, { data: p }] = await Promise.all([
        sb().from("organiser_event_stats").select("*").order("starts_at"),
        sb().from("payouts").select("*").order("period_end", { ascending: false }),
      ]);
      setStats((s ?? []) as Stat[]);
      setPayouts((p ?? []) as Payout[]);
    });
  }, []);

  const sum = (k: keyof Stat) => (stats ?? []).reduce((a, s) => a + Number(s[k] ?? 0), 0);

  return (
    <>
      <TopBar />
      <main>
        <div className="row between">
          <h3 className="display" style={{ margin: 0, fontSize: 18 }}>{t("organiser")}</h3>
          {stats && stats.length > 0 && <Link href="/org/new" className="btn primary sm">{t("newEvent")}</Link>}
        </div>
        {user === null && (
          <div className="card stack">
            <p style={{ margin: 0 }}>{t("signInOrg")}</p>
            <Link href="/login?next=/org" className="btn green">{t("signIn")}</Link>
          </div>
        )}
        {stats && stats.length === 0 && user && <div className="empty">{t("noOrg")}</div>}
        {stats && stats.length > 0 && (
          <>
            <div className="kpis">
              <div className="kpi"><div className="label">{t("sold")}</div><b className="num">{sum("sold")}</b></div>
              <div className="kpi"><div className="label">{t("gross")}</div><b className="num">{money(sum("gross"))}</b></div>
              <div className="kpi"><div className="label">{t("checkedIn")}</div><b className="num">{sum("checked_in")}</b></div>
            </div>
            <div className="card">
              {stats.map((s) => (
                <Link key={s.event_id} href={`/org/e/${s.event_id}`} className="orow">
                  <div>
                    <b>{s.title}</b>
                    <small>{fmtDate(s.starts_at)} · {s.sold}/{s.capacity} · {s.status}</small>
                    <div className="avail"><i style={{ width: `${Math.round((s.sold / Math.max(s.capacity, 1)) * 100)}%` }} /></div>
                  </div>
                  <div className="num" style={{ fontWeight: 700 }}>{money(Number(s.gross))}</div>
                </Link>
              ))}
            </div>
            <div className="card">
              <div className="label" style={{ marginBottom: 4 }}>{t("payouts")}</div>
              {payouts.length ? (
                payouts.map((p) => (
                  <div key={p.id} className="orow">
                    <div>
                      <b>{p.period_start} → {p.period_end}</b>
                      <small>{p.status}</small>
                    </div>
                    <div className="num" style={{ fontWeight: 700 }}>{money(Number(p.amount))}</div>
                  </div>
                ))
              ) : (
                <div className="note">{t("firstPayout")}</div>
              )}
            </div>
            <div className="row">
              <Link href="/org/finance" className="btn green">{t("finance")}</Link>
              {roles.isDoor && <Link href="/org/door" className="btn ghost">{t("openDoor")}</Link>}
            </div>
          </>
        )}
      </main>
    </>
  );
}
