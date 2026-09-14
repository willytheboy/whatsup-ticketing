"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { allInKind, money, organiserNet, LISTING_CATEGORIES, type OfferKind } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Venue = { id: string; name: string; city: string };
const TYPES: [OfferKind, string][] = [["ticket", "tTicket"], ["table", "tTable"], ["daypass", "tDaypass"], ["stay", "tStay"], ["item", "tItem"], ["pass", "tPass"]];
const CAT_FOR: Record<string, string> = { ticket: "Events", table: "Dining", daypass: "Beach", stay: "Stay", item: "Events", pass: "Beach" };
const KIND_FOR: Record<string, string> = { ticket: "event", table: "venue", daypass: "venue", stay: "stay", item: "event", pass: "pass" };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) + "-" + Math.random().toString(36).slice(2, 5);

/** New listing (brief §5.14): poster-to-listing box (AI drafts the fields), type selector first, then the few fields that matter,
    with a live preview of the buyer price and what the venue receives. */
export default function NewListing() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const router = useRouter();
  const { user, org, plan } = useOrg();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [kind, setKind] = useState<OfferKind>("ticket");
  const [f, setF] = useState({ name: "", name_ar: "", when: "", price: 20, cap: 100, max: 6, venue_id: "", newVenue: "", city: "Beirut", cat: "Events", desc: "" });
  const [captionOn, setCaptionOn] = useState(false);
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (user === null) router.replace("/login?next=/org/new");
    sb().from("venues").select("id,name,city").order("name").then(({ data }) => setVenues((data ?? []) as Venue[]));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const extract = async (body: any) => {
    setMsg(t("reading"));
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "extract", lang, ...body }) });
      const d = await r.json();
      if (d.kind && TYPES.some(([k]) => k === d.kind)) setKind(d.kind);
      setF((s) => ({ ...s, name: d.name || s.name, name_ar: d.name_ar || s.name_ar, when: d.date || s.when, price: Number(d.price) || 0, cap: Number(d.cap) || s.cap, desc: d.desc || s.desc, cat: CAT_FOR[d.kind] ?? s.cat, newVenue: d.venue && !venues.some((v) => v.name === d.venue) ? d.venue : s.newVenue, venue_id: venues.find((v) => v.name === d.venue)?.id ?? s.venue_id, city: d.city || s.city }));
      setMsg("✓ " + t("filled"));
    } catch { setMsg(t("noResults")); }
  };
  const readPoster = (fl: File | undefined) => {
    if (!fl) return;
    const r = new FileReader();
    r.onload = () => extract({ image: String(r.result).split(",")[1], mime: fl.type });
    r.readAsDataURL(fl);
  };

  const submit = async (status: "live" | "draft") => {
    if (!f.name.trim()) return setErr(t("needName"));
    if (!org) return setErr(t("noOrg"));
    setBusy(true); setErr("");
    let venueId = f.venue_id;
    if (!venueId && f.newVenue.trim()) {
      const { data: v } = await sb().from("venues").insert({ tenant_id: org.tenant_id, name: f.newVenue.trim(), city: f.city }).select("id").single();
      venueId = v?.id;
    }
    const when = f.when ? new Date(f.when) : new Date(Date.now() + 864e5);
    const ekind = KIND_FOR[kind];
    const { data: ev, error } = await sb().from("events").insert({
      tenant_id: org.tenant_id, organiser_id: org.id, venue_id: venueId || null, slug: slugify(f.name), title: f.name.trim(), title_ar: f.name_ar.trim() || null,
      description: f.desc || null, category: f.cat, kind: ekind, starts_at: when.toISOString(), doors_at: when.toISOString(),
      ends_at: ekind === "event" ? null : new Date(when.getTime() + 120 * 864e5).toISOString(), status,
    }).select("id,slug").single();
    if (error || !ev) { setBusy(false); return setErr(error?.message ?? "insert"); }
    if (kind === "table") await sb().from("tables_vip").insert({ event_id: ev.id, name: f.name.trim(), seats: Math.max(2, Math.min(12, f.max)), min_spend: 0, deposit: +f.price || 0 });
    else if (kind === "pass") await sb().from("tiers").insert([1, 4, 12].map((m, i) => ({ event_id: ev.id, name: [t("monthly"), t("season"), t("annual")][i], face_price: Math.round(+f.price * [1, 3.6, 6][i]), capacity: 9999, kind: "pass", plan_months: m, per_order_limit: 1, sort: i })));
    else await sb().from("tiers").insert({ event_id: ev.id, name: f.name.trim(), face_price: +f.price || 0, capacity: +f.cap || 100, kind, per_order_limit: +f.max || 6, sort: 0 });
    setBusy(false);
    toast(status === "live" ? t("published") : t("draftSaved"));
    router.replace(status === "live" ? `/e/${ev.slug}` : "/org");
  };

  const unitFor = kind === "table" ? t("covers") : kind === "daypass" ? t("sunbeds") : kind === "stay" ? t("rooms") : kind === "item" ? t("stock") : t("seats");
  const preview = kind === "table" ? t("tableNote") : kind === "pass" ? `${t("buyerSees")}: $${f.price} ${t("perMonth")}` : f.price > 0
    ? `${t("buyerSees")}: $${allInKind(kind, +f.price)} ${kind === "stay" ? t("perNight") : t("allIn")} · ${t("youGet")} ${money(organiserNet(+f.price, plan.orgPct))}`
    : `${t("buyerSees")}: ${t("free")}`;

  return (
    <>
      <TopBar back="/org" title={t("newListing")} />
      <main>
        <div className="drop" style={{ marginTop: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>✨ {t("fromPoster")}</div>
          <div className="small" style={{ margin: "4px 0 8px" }}>{t("posterNote")}</div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => readPoster(e.target.files?.[0])} />
          <div className="grid2">
            <button className="btn green sm" onClick={() => file.current?.click()}>📷 {t("poster")}</button>
            <button className="btn line sm" onClick={() => setCaptionOn((v) => !v)}>📝 {t("captionBtn")}</button>
          </div>
          {captionOn && <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption.trim() && extract({ text: caption })} placeholder={t("pasteCaption")} style={{ width: "100%", marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, padding: 10, fontSize: 14 }} />}
          {msg && <div className="small" style={{ marginTop: 6 }}>{msg}</div>}
        </div>
        <div className="field">
          <label>{t("fType")}</label>
          <select value={kind} onChange={(e) => { const k = e.target.value as OfferKind; setKind(k); set("cat", CAT_FOR[k]); }}>
            {TYPES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
          </select>
        </div>
        <div className="field"><label>{t("fName")}</label><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Full Moon Beach Party" /></div>
        <div className="field"><label>{t("fNameAr")}</label><input dir="rtl" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} placeholder="حفلة القمر الكامل" /></div>
        <div className="grid2">
          <div className="field"><label>{t("fDate")}</label><input type="datetime-local" value={f.when} onChange={(e) => set("when", e.target.value)} /></div>
          <div className="field"><label>{t("category")}</label><select value={f.cat} onChange={(e) => set("cat", e.target.value)}>{LISTING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="field">
          <label>{t("venue")}</label>
          <select value={f.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
            <option value="">— {t("venue")} —</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.city}</option>)}
          </select>
        </div>
        {!f.venue_id && <div className="grid2"><div className="field"><input value={f.newVenue} onChange={(e) => set("newVenue", e.target.value)} placeholder={t("venue")} /></div><div className="field"><input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder={t("city")} /></div></div>}
        <div className="grid2">
          <div className="field"><label>{kind === "table" ? `${t("deposit")}, USD` : t("fPrice")}</label><input type="number" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} /></div>
          <div className="field"><label>{kind === "table" ? t("seats") : `${t("fCap")} (${unitFor})`}</label><input type="number" inputMode="numeric" value={kind === "table" ? f.max : f.cap} onChange={(e) => set(kind === "table" ? "max" : "cap", e.target.value)} /></div>
        </div>
        {kind !== "table" && kind !== "pass" && <div className="field"><label>{t("fMax")}</label><input type="number" inputMode="numeric" value={f.max} onChange={(e) => set("max", e.target.value)} /></div>}
        <div className="field"><label>{t("fDesc")}</label><textarea value={f.desc} onChange={(e) => set("desc", e.target.value)} /></div>
        <div className="card sand pad" style={{ fontSize: 13 }}>{preview}</div>
        {err && <div className="err">{err}</div>}
        <div className="grid2">
          <button className="btn red" disabled={busy} onClick={() => submit("live")}>{t("publish")}</button>
          <button className="btn line" disabled={busy} onClick={() => submit("draft")}>{t("saveDraft")}</button>
        </div>
        {org && <p className="small" style={{ textAlign: "center" }}>{org.name} · {t(`plan${org.plan[0].toUpperCase()}${org.plan.slice(1)}`)} · <Link href="/org/plan" style={{ color: "var(--g1)" }}>{t("upgrade")}</Link></p>}
      </main>
    </>
  );
}
