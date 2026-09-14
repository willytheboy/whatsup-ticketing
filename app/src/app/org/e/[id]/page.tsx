"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { allInKind, money } from "@/lib/config";
import { useT } from "@/lib/lang";

const CATEGORIES = ["Events", "Music", "Dining", "Beach", "Stay", "Theatre", "Sport", "Festival", "Comedy", "Food", "Outdoors", "Art", "Sports"];
const toLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
type Tier = { id?: string; name: string; name_ar?: string | null; face_price: number | string; capacity: number | string; sold: number; held: number; per_order_limit: number; sort?: number };

export default function ManageEvent({ params }: { params: { id: string } }) {
  const t = useT();
  const router = useRouter();
  const [ev, setEv] = useState<any>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace(`/login?next=/org/e/${params.id}`);
      const { data } = await sb().from("events").select("*,tiers(*)").eq("id", params.id).maybeSingle();
      if (!data) return setErr(t("noOrg"));
      setEv(data);
      setTiers([...(data.tiers ?? [])].sort((a: Tier, b: Tier) => (a.sort ?? 0) - (b.sort ?? 0)));
    })();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: unknown) => setEv((e: any) => ({ ...e, [k]: v }));
  const setTier = (i: number, k: keyof Tier, v: unknown) => setTiers(tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2000); };

  const save = async () => {
    setBusy(true);
    setErr("");
    const { error } = await sb()
      .from("events")
      .update({
        title: ev.title, title_ar: ev.title_ar || null, description: ev.description || null, description_ar: ev.description_ar || null,
        category: ev.category, starts_at: new Date(ev.starts_at).toISOString(), doors_at: ev.doors_at ? new Date(ev.doors_at).toISOString() : null, status: ev.status,
      })
      .eq("id", ev.id);
    if (error) { setBusy(false); return setErr(error.message); }
    for (const x of tiers) {
      if (x.id) {
        await sb().from("tiers").update({ name: x.name, name_ar: x.name_ar || null, face_price: +x.face_price || 0, capacity: Math.max(+x.capacity || 0, x.sold + x.held), per_order_limit: +x.per_order_limit || 6 }).eq("id", x.id);
      } else if (x.name?.trim()) {
        await sb().from("tiers").insert({ event_id: ev.id, name: x.name.trim(), face_price: +x.face_price || 0, capacity: +x.capacity || 0, sort: tiers.indexOf(x) });
      }
    }
    setBusy(false);
    flash(t("saved"));
  };

  const duplicate = async () => {
    setBusy(true);
    const { data, error } = await sb()
      .from("events")
      .insert({
        tenant_id: ev.tenant_id, organiser_id: ev.organiser_id, venue_id: ev.venue_id,
        slug: ev.slug.replace(/-[a-z0-9]{3}$/, "") + "-" + Math.random().toString(36).slice(2, 5),
        title: ev.title + " (copy)", title_ar: ev.title_ar, description: ev.description, description_ar: ev.description_ar, category: ev.category,
        starts_at: ev.starts_at, doors_at: ev.doors_at, status: "draft", seated: ev.seated, refund_policy: ev.refund_policy,
      })
      .select("id")
      .single();
    if (error || !data) { setBusy(false); return setErr(error?.message ?? "copy"); }
    await sb().from("tiers").insert(
      tiers.filter((x) => x.id).map((x, i) => ({ event_id: data.id, name: x.name, name_ar: x.name_ar, face_price: +x.face_price || 0, capacity: +x.capacity || 0, per_order_limit: x.per_order_limit, sort: i })),
    );
    router.push(`/org/e/${data.id}`);
  };

  const archive = async () => {
    setBusy(true);
    await sb().from("events").update({ status: "archived" }).eq("id", ev.id);
    router.replace("/org");
  };

  if (!ev)
    return (
      <>
        <TopBar back="/org" title={t("manage")} />
        <main><div className="empty">{err || t("loading")}</div></main>
      </>
    );

  const sold = tiers.reduce((a, x) => a + (x.sold ?? 0), 0);
  const cap = tiers.reduce((a, x) => a + (+x.capacity || 0), 0);

  return (
    <>
      <TopBar back="/org" title={t("manage")} />
      <main>
        <div className="row between">
          <span className={`pill ${ev.status === "live" ? "ok" : ev.status === "draft" ? "gold" : ""}`}>
            {ev.status === "live" ? t("live") : ev.status === "draft" ? t("draftS") : ev.status}
          </span>
          <span className="note num">{sold}/{cap} {t("soldLabel")}</span>
        </div>
        <div className="seg">
          {([["draft", t("draftS")], ["live", t("live")], ["archived", t("archived")]] as [string, string][]).map(([v, label]) => (
            <button key={v} className={ev.status === v ? "on" : ""} onClick={() => set("status", v)}>{label}</button>
          ))}
        </div>
        <div className="card pad stack">
          <div className="field"><span className="label">{t("evName")}</span><input value={ev.title ?? ""} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="field"><span className="label">{t("evNameAr")}</span><input dir="rtl" value={ev.title_ar ?? ""} onChange={(e) => set("title_ar", e.target.value)} /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <span className="label">{t("dateTime")}</span>
              <input type="datetime-local" value={toLocal(ev.starts_at)} onChange={(e) => set("starts_at", e.target.value)} />
            </div>
            <div className="field" style={{ width: 130 }}>
              <span className="label">{t("category")}</span>
              <select value={ev.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><span className="label">{t("desc")}</span><textarea value={ev.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
        </div>
        <div className="card pad stack">
          <div className="tierrow label"><span>{t("tierName")}</span><span>{t("price")}</span><span>{t("qty")}</span><span /></div>
          {tiers.map((x, i) => (
            <div key={x.id ?? i}>
              <div className="tierrow">
                <input value={x.name ?? ""} onChange={(e) => setTier(i, "name", e.target.value)} />
                <input inputMode="decimal" value={x.face_price} onChange={(e) => setTier(i, "face_price", e.target.value)} />
                <input inputMode="numeric" value={x.capacity} onChange={(e) => setTier(i, "capacity", e.target.value)} />
                <span className="note num" style={{ width: 28, textAlign: "end" }}>{x.sold ?? 0}</span>
              </div>
              <div className="note num">
                {+x.face_price > 0 ? `${money(allInKind((x as any).kind ?? "ticket", +x.face_price))} ${t("allIn")} · ${t((x as any).kind ?? "ticket")} · ${x.sold ?? 0} ${t("soldLabel")}` : t("free")}
              </div>
            </div>
          ))}
          <button className="btn ghost sm" onClick={() => setTiers([...tiers, { name: "VIP", face_price: 60, capacity: 40, sold: 0, held: 0, per_order_limit: 6, kind: "ticket" } as any])}>{t("addTier")}</button>
        </div>
        {err && <div className="err">{err}</div>}
        {toast && <div className="tag ok" style={{ alignSelf: "center" }}>{toast}</div>}
        <button className="btn green" disabled={busy} onClick={save}>{t("saveChanges")}</button>
        <Link className="btn red" href={`/org/promote/${ev.id}`}>★ {t("promote")}</Link>
        <div className="row">
          <button className="btn ghost" disabled={busy} onClick={duplicate}>{t("duplicate")}</button>
          <Link className="btn ghost" href={`/e/${ev.slug}`}>{t("viewPublic")}</Link>
        </div>
        <button className="btn ghost" style={{ color: "var(--red)" }} disabled={busy} onClick={archive}>{t("archive")}</button>
      </main>
    </>
  );
}
