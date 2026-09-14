"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { allInKind, money, organiserNet, LISTING_CATEGORIES, hasPlan, type OfferKind } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Venue = { id: string; name: string; city: string };
type Offer = { id: string; kind: OfferKind; name: string; name_ar: string; price: number | string; cap: number | string; max: number | string };
const TYPES: [OfferKind, string][] = [["ticket", "tTicket"], ["table", "tTable"], ["daypass", "tDaypass"], ["stay", "tStay"], ["item", "tItem"], ["pass", "tPass"]];
const CAT_FOR: Record<string, string> = { ticket: "Events", table: "Dining", daypass: "Beach", stay: "Stay", item: "Events", pass: "Beach" };
const KIND_FOR: Record<string, string> = { ticket: "event", table: "venue", daypass: "venue", stay: "stay", item: "event", pass: "pass" };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) + "-" + Math.random().toString(36).slice(2, 5);
const rid = () => Math.random().toString(36).slice(2, 8);
const defaults = (k: OfferKind): Partial<Offer> => k === "table" ? { price: 100, cap: 6, max: 6 } : k === "stay" ? { price: 95, cap: 4, max: 2 } : k === "daypass" ? { price: 15, cap: 60, max: 6 } : k === "item" ? { price: 12, cap: 100, max: 4 } : k === "pass" ? { price: 89, cap: 9999, max: 1 } : { price: 20, cap: 100, max: 6 };

/** New listing (brief §5.14): poster-to-listing box (AI drafts the fields), then one object with as many offers as the venue sells —
    tickets, tables, day passes, rooms, items, passes — with a live preview of the buyer price and what the venue receives. */
export default function NewListing() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const router = useRouter();
  const { user, org, plan } = useOrg();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [kind, setKind] = useState<OfferKind>("ticket");
  const [f, setF] = useState({ name: "", name_ar: "", when: "", venue_id: "", newVenue: "", city: "Beirut", cat: "Events", desc: "", desc_ar: "", pinned: "", cover: null as File | null });
  const [offers, setOffers] = useState<Offer[]>([{ id: rid(), kind: "ticket", name: "General", name_ar: "", ...defaults("ticket") } as Offer]);
  const [captionOn, setCaptionOn] = useState(false);
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const cover = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));
  const setO = (i: number, k: keyof Offer, v: any) => setOffers(offers.map((o, j) => (j === i ? { ...o, [k]: v } : o)));

  useEffect(() => {
    if (user === null) router.replace("/login?next=/org/new");
    sb().from("venues").select("id,name,city").order("name").then(({ data }) => setVenues((data ?? []) as Venue[]));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (k: OfferKind) => {
    setKind(k); set("cat", CAT_FOR[k]);
    setOffers((os) => (os.length === 1 && !os[0].name.trim() || os.length === 1 && os[0].name === "General" ? [{ ...os[0], kind: k, name: k === "table" ? "Table for 6" : k === "daypass" ? "Sunbed day pass" : k === "stay" ? "Double room" : k === "item" ? "Item" : k === "pass" ? "Monthly" : "General", ...defaults(k) } as Offer] : os));
  };
  const extract = async (body: any) => {
    setMsg(t("reading"));
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "extract", lang, ...body }) });
      const d = await r.json();
      if (d.kind && TYPES.some(([k]) => k === d.kind)) pick(d.kind);
      setF((s) => ({ ...s, name: d.name || s.name, name_ar: d.name_ar || s.name_ar, when: d.date || s.when, desc: d.desc || s.desc, cat: CAT_FOR[d.kind] ?? s.cat, newVenue: d.venue && !venues.some((v) => v.name === d.venue) ? d.venue : s.newVenue, venue_id: venues.find((v) => v.name === d.venue)?.id ?? s.venue_id, city: d.city || s.city }));
      if (d.price || d.cap) setOffers((os) => [{ ...os[0], price: Number(d.price) || os[0].price, cap: Number(d.cap) || os[0].cap }, ...os.slice(1)]);
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
    const real = offers.filter((o) => o.name.trim());
    if (!real.length) return setErr(t("needOffer"));
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
      description: f.desc || null, description_ar: f.desc_ar || null, pinned: f.pinned || null, category: f.cat, kind: ekind, starts_at: when.toISOString(), doors_at: when.toISOString(),
      ends_at: ekind === "event" ? null : new Date(when.getTime() + 120 * 864e5).toISOString(), status, refund_policy: { type: "until_hours_before", hours: 24 },
    }).select("id,slug").single();
    if (error || !ev) { setBusy(false); return setErr(error?.message ?? "insert"); }
    const tables = real.filter((o) => o.kind === "table");
    const tiers = real.filter((o) => o.kind !== "table");
    if (tables.length) await sb().from("tables_vip").insert(tables.map((o) => ({ event_id: ev.id, name: o.name.trim(), name_ar: o.name_ar || null, seats: Math.max(2, Math.min(20, +o.cap || 6)), min_spend: 0, deposit: +o.price || 0, packages: [] })));
    if (tiers.length) await sb().from("tiers").insert(tiers.flatMap((o, i): any[] => o.kind === "pass"
      ? [1, 4, 12].map((m, j) => ({ event_id: ev.id, name: [t("monthly"), t("season"), t("annual")][j], face_price: Math.round(+o.price * [1, 3.6, 6][j]), capacity: 9999, kind: "pass", plan_months: m, per_order_limit: 1, sort: i * 3 + j }))
      : [{ event_id: ev.id, name: o.name.trim(), name_ar: o.name_ar || null, face_price: +o.price || 0, capacity: +o.cap || 100, kind: o.kind, per_order_limit: +o.max || 6, sort: i }]));
    if (f.cover) {
      const path = `${ev.id}/cover-${Date.now()}.${(f.cover.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error: ue } = await sb().storage.from("covers").upload(path, f.cover, { upsert: true, contentType: f.cover.type });
      if (!ue) await sb().from("events").update({ cover_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xhwmgnhspyaqsgggvujo.supabase.co"}/storage/v1/object/public/covers/${path}` }).eq("id", ev.id);
    }
    setBusy(false);
    toast(status === "live" ? t("published") : t("draftSaved"));
    router.replace(status === "live" ? `/e/${ev.slug}` : `/org/e/${ev.id}`);
  };

  const unitFor = (k: OfferKind) => (k === "table" ? t("seats") : k === "daypass" ? t("sunbeds") : k === "stay" ? t("rooms") : k === "item" ? t("stock") : t("seats"));
  const preview = (o: Offer) => o.kind === "table" ? t("tableNote") : o.kind === "pass" ? `${t("buyerSees")}: $${o.price} ${t("perMonth")}` : +o.price > 0
    ? `${t("buyerSees")}: $${allInKind(o.kind, +o.price)} ${o.kind === "stay" ? t("perNight") : t("allIn")} · ${t("youGet")} ${money(organiserNet(+o.price, plan.orgPct))}`
    : `${t("buyerSees")}: ${t("free")}`;

  return (
    <>
      <TopBar back="/org" title={t("newListing")} />
      <main>
        <div className="drop" style={{ marginTop: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>✨ {t("fromPoster")}</div>
          <div className="small" style={{ margin: "4px 0 8px" }}>{t("posterNote")}</div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { readPoster(e.target.files?.[0]); if (e.target.files?.[0] && !f.cover) set("cover", e.target.files[0]); }} />
          <div className="grid2">
            <button className="btn green sm" onClick={() => file.current?.click()}>📷 {t("poster")}</button>
            <button className="btn line sm" onClick={() => setCaptionOn((v) => !v)}>📝 {t("captionBtn")}</button>
          </div>
          {captionOn && <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption.trim() && extract({ text: caption })} placeholder={t("pasteCaption")} style={{ width: "100%", marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, padding: 10, fontSize: 14 }} />}
          {msg && <div className="small" style={{ marginTop: 6 }}>{msg}</div>}
        </div>
        <div className="field">
          <label>{t("fType")}</label>
          <select value={kind} onChange={(e) => pick(e.target.value as OfferKind)}>
            {TYPES.map(([k, l]) => <option key={k} value={k} disabled={k === "pass" && !hasPlan(org?.plan, "venue")}>{t(l)}{k === "pass" && !hasPlan(org?.plan, "venue") ? " · Venue" : ""}</option>)}
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
            <option value="">— {t("newVenue")} —</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.city}</option>)}
          </select>
        </div>
        {!f.venue_id && <div className="grid2"><div className="field"><input value={f.newVenue} onChange={(e) => set("newVenue", e.target.value)} placeholder={t("venue")} /></div><div className="field"><input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder={t("city")} /></div></div>}

        <div className="eyebrow" style={{ marginTop: 6 }}>{t("offersH")}</div>
        {offers.map((o, i) => (
          <div key={o.id} className="card pad stack">
            <div className="row between">
              <select value={o.kind} onChange={(e) => { const k = e.target.value as OfferKind; setOffers(offers.map((x, j) => (j === i ? { ...x, kind: k, ...defaults(k) } as Offer : x))); }} style={{ width: "auto" }}>{TYPES.map(([k, l]) => <option key={k} value={k} disabled={k === "pass" && !hasPlan(org?.plan, "venue")}>{t(l)}</option>)}</select>
              {offers.length > 1 && <button className="btn xs line" onClick={() => setOffers(offers.filter((_, j) => j !== i))}>{t("remove")}</button>}
            </div>
            <div className="grid2">
              <div className="field"><label>{t("tierName")}</label><input value={o.name} onChange={(e) => setO(i, "name", e.target.value)} /></div>
              <div className="field"><label>{t("fNameAr")}</label><input dir="rtl" value={o.name_ar} onChange={(e) => setO(i, "name_ar", e.target.value)} /></div>
            </div>
            <div className="grid3">
              <div className="field"><label>{o.kind === "table" ? `${t("deposit")} $` : o.kind === "pass" ? `$ ${t("perMonth")}` : t("fPrice")}</label><input type="number" inputMode="decimal" value={o.price} onChange={(e) => setO(i, "price", e.target.value)} /></div>
              <div className="field"><label>{o.kind === "table" ? t("seats") : `${t("fCap")} · ${unitFor(o.kind)}`}</label><input type="number" inputMode="numeric" value={o.cap} onChange={(e) => setO(i, "cap", e.target.value)} /></div>
              {o.kind !== "table" && o.kind !== "pass" && <div className="field"><label>{t("fMax")}</label><input type="number" inputMode="numeric" value={o.max} onChange={(e) => setO(i, "max", e.target.value)} /></div>}
            </div>
            <div className="small">{preview(o)}</div>
          </div>
        ))}
        <button className="btn line sm" onClick={() => setOffers([...offers, { id: rid(), kind: kind === "table" ? "item" : "table", name: kind === "table" ? "Item" : "Table for 6", name_ar: "", ...defaults(kind === "table" ? "item" : "table") } as Offer])}>{t("addOffer")}</button>

        <div className="field"><label>{t("fDesc")}</label><textarea value={f.desc} onChange={(e) => set("desc", e.target.value)} /></div>
        <div className="field"><label>{t("descAr")}</label><textarea dir="rtl" value={f.desc_ar} onChange={(e) => set("desc_ar", e.target.value)} /></div>
        <div className="field"><label>{t("pinnedLine")}</label><input value={f.pinned} onChange={(e) => set("pinned", e.target.value)} placeholder={t("pinnedPh")} /></div>
        <div className="field">
          <label>{t("cover")}</label>
          <input ref={cover} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => set("cover", e.target.files?.[0] ?? null)} />
          <button className="btn line sm" onClick={() => cover.current?.click()}>{f.cover ? `✓ ${f.cover.name}` : t("addCover")}</button>
        </div>
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
