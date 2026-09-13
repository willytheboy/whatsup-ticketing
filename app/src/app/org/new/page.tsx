"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { allIn, money, organiserNet } from "@/lib/config";
import { useT } from "@/lib/lang";

const CATEGORIES = ["Music", "Festival", "Comedy", "Food", "Outdoors", "Art", "Sports"];
type Venue = { id: string; name: string; city: string };
type TierDraft = { n: string; p: number; c: number };

export default function NewEvent() {
  const t = useT();
  const router = useRouter();
  const [membership, setMembership] = useState<{ organiser_id: string; tenant_id: string } | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", title_ar: "", venue_id: "", newVenue: "", city: "Beirut", when: "", cat: "Music", desc: "" });
  const [tiers, setTiers] = useState<TierDraft[]>([
    { n: "Early Bird", p: 15, c: 100 },
    { n: "Regular", p: 25, c: 300 },
  ]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace("/login?next=/org/new");
      const { data: m } = await sb()
        .from("memberships")
        .select("organiser_id,tenant_id")
        .in("role", ["organiser", "country_admin", "super_admin"])
        .not("organiser_id", "is", null)
        .limit(1)
        .maybeSingle();
      setMembership(m);
      const { data: v } = await sb().from("venues").select("id,name,city").order("name");
      setVenues((v ?? []) as Venue[]);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (status: "live" | "draft") => {
    if (!form.title.trim() || !form.when) return setErr(t("evName"));
    if (!membership) return setErr(t("noOrg"));
    setBusy(true);
    setErr("");
    let venueId = form.venue_id;
    if (!venueId && form.newVenue.trim()) {
      const { data: v } = await sb().from("venues").insert({ tenant_id: membership.tenant_id, name: form.newVenue.trim(), city: form.city }).select("id").single();
      venueId = v?.id;
    }
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) + "-" + Math.random().toString(36).slice(2, 5);
    const { data: ev, error } = await sb()
      .from("events")
      .insert({
        tenant_id: membership.tenant_id, organiser_id: membership.organiser_id, venue_id: venueId || null, slug,
        title: form.title.trim(), title_ar: form.title_ar.trim() || null, description: form.desc || null, category: form.cat,
        starts_at: new Date(form.when).toISOString(), doors_at: new Date(form.when).toISOString(), status,
      })
      .select("id,slug")
      .single();
    if (error || !ev) { setBusy(false); return setErr(error?.message ?? "insert"); }
    await sb().from("tiers").insert(tiers.filter((x) => x.n.trim()).map((x, i) => ({ event_id: ev.id, name: x.n.trim(), face_price: +x.p || 0, capacity: +x.c || 0, sort: i })));
    router.replace(status === "live" ? `/e/${ev.slug}` : "/org");
  };

  const setTier = (i: number, patch: Partial<TierDraft>) => setTiers(tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <TopBar back="/org" title={t("newEvent").replace("+ ", "")} />
      <main>
        <div className="card stack">
          <div className="field"><span className="label">{t("evName")}</span><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Rooftop Sessions #4" /></div>
          <div className="field"><span className="label">{t("evNameAr")}</span><input dir="rtl" value={form.title_ar} onChange={(e) => set("title_ar", e.target.value)} placeholder="جلسات السطح ٤" /></div>
          <div className="field">
            <span className="label">{t("venue")}</span>
            <select value={form.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
              <option value="">— new venue —</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.city}</option>)}
            </select>
          </div>
          {!form.venue_id && (
            <div className="row">
              <div className="field" style={{ flex: 1 }}><input value={form.newVenue} onChange={(e) => set("newVenue", e.target.value)} placeholder={t("venue")} /></div>
              <div className="field" style={{ width: 120 }}><input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={t("city")} /></div>
            </div>
          )}
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <span className="label">{t("dateTime")}</span>
              <input type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} />
            </div>
            <div className="field" style={{ width: 130 }}>
              <span className="label">{t("category")}</span>
              <select value={form.cat} onChange={(e) => set("cat", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><span className="label">{t("desc")}</span><textarea value={form.desc} onChange={(e) => set("desc", e.target.value)} /></div>
        </div>
        <div className="card stack">
          <div className="tierrow label"><span>{t("tierName")}</span><span>{t("price")}</span><span>{t("qty")}</span><span /></div>
          {tiers.map((x, i) => (
            <div key={i}>
              <div className="tierrow">
                <input value={x.n} onChange={(e) => setTier(i, { n: e.target.value })} />
                <input inputMode="decimal" value={x.p} onChange={(e) => setTier(i, { p: +e.target.value })} />
                <input inputMode="numeric" value={x.c} onChange={(e) => setTier(i, { c: +e.target.value })} />
                <button onClick={() => tiers.length > 1 && setTiers(tiers.filter((_, j) => j !== i))} aria-label="remove">×</button>
              </div>
              <div className="note num">
                {x.p > 0 ? `${money(allIn(x.p))} ${t("perTicket")} · ${t("youGet")} ${money(organiserNet(x.p))}` : t("free")}
              </div>
            </div>
          ))}
          <button className="btn ghost sm" onClick={() => setTiers([...tiers, { n: "VIP", p: 60, c: 40 }])}>{t("addTier")}</button>
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy} onClick={() => submit("live")}>{t("publish")}</button>
        <button className="btn ghost" disabled={busy} onClick={() => submit("draft")}>{t("draft")}</button>
      </main>
    </>
  );
}
