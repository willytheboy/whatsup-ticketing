"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { allInKind, money, LISTING_CATEGORIES, type OfferKind, SUPABASE_URL, hasPlan } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";
import { useConfig } from "@/components/Config";
import { tierAdvice, type TierPace } from "@/lib/forecast";

const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);
type Tier = { id?: string; name: string; name_ar?: string | null; kind: OfferKind; face_price: number | string; capacity: number | string; sold: number; held: number; per_order_limit: number | string; sale_starts?: string | null; sale_ends?: string | null; member_free?: boolean; plan_months?: number | string | null; note?: string | null; sort?: number; _del?: boolean };
type Pkg = { id: string; name: string; name_ar?: string; price: number | string; desc?: string };
type Table = { id?: string; name: string; name_ar?: string | null; seats: number | string; min_spend: number | string; deposit: number | string; reserved_by_order?: string | null; packages: Pkg[]; _del?: boolean };
type Deal = { id: string; name: string; name_ar?: string; member_only?: boolean };
type Addon = { id: string; name: string; name_ar?: string; price: number | string; per: "order" | "ticket"; max?: number | string };
type Refund = { id: string; buyer: string | null; buyer_phone: string | null; total: number; payment_method: string; refund_status: string; refund_requested_at: string; addons: any[] };
const KINDS: OfferKind[] = ["ticket", "daypass", "item", "stay", "pass", "table"];
const LKINDS = ["event", "venue", "stay", "pass"];
const POLICIES: [string, string][] = [["none", "polNone"], ["24", "pol24"], ["48", "pol48"], ["flexible", "polFlex"]];
const rid = () => Math.random().toString(36).slice(2, 8);

/** Listing editor (brief §5.14): cover, basics in EN/AR, pinned line, deals, every offer kind with sale windows,
    VIP tables with packages, refund policy, refund queue, waitlist reopen, duplicate, archive. */
export default function ManageEvent({ params }: { params: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const router = useRouter();
  const { org } = useOrg();
  const [ev, setEv] = useState<any>(null);
  const [venue, setVenue] = useState<any>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [pace, setPace] = useState<TierPace[] | null>(null);
  const [flash, setFlash] = useState<any[]>([]);
  const { features } = useConfig();
  const [waits, setWaits] = useState<Record<string, number>>({});
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"basics" | "offers" | "tables" | "deals" | "addons" | "pricing" | "refunds">("basics");
  const file = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return router.replace(`/login?next=/org/e/${params.id}`);
    const [{ data }, { data: vs }] = await Promise.all([
      sb().from("events").select("*,tiers(*),tables_vip(*),venues(*)").eq("id", params.id).maybeSingle(),
      sb().from("venues").select("id,name,city").order("name"),
    ]);
    if (!data) return setErr(t("noOrg"));
    setEv({ ...data, tiers: undefined, tables_vip: undefined, venues: undefined });
    setVenue(data.venues ?? { name: "", name_ar: "", city: "Beirut", city_ar: "", address: "", address_ar: "", lat: "", lng: "" });
    setVenues(vs ?? []);
    setTiers([...(data.tiers ?? [])].sort((a: Tier, b: Tier) => (a.sort ?? 0) - (b.sort ?? 0)).map((x: any) => ({ ...x, kind: x.kind ?? "ticket" })));
    setTables((data.tables_vip ?? []).map((x: any) => ({ ...x, packages: x.packages ?? [] })));
    setDeals(data.deals ?? []);
    setAddons(Array.isArray(data.addon_options) ? data.addon_options : []);
    // pricing assistant: pace per tier (security-definer RPC, organiser-scoped) and the live flash codes
    sb().rpc("tier_pace", { p_event: params.id }).then(({ data: pr }) => setPace((pr as TierPace[]) ?? []));
    sb().from("promo_codes").select("code,pct_off,ends_at,uses,max_uses").eq("event_id", params.id).eq("source", "flash").eq("active", true).gt("ends_at", new Date().toISOString()).then(({ data: fc }) => setFlash(fc ?? []));
    const tierIds = (data.tiers ?? []).map((x: any) => x.id);
    if (tierIds.length) {
      const { data: w } = await sb().from("waitlist").select("tier_id").in("tier_id", tierIds).is("notified_at", null);
      const m: Record<string, number> = {}; for (const r of w ?? []) m[r.tier_id] = (m[r.tier_id] ?? 0) + 1; setWaits(m);
    }
    const { data: rf } = await sb().from("v_org_refunds").select("*").eq("event_id", params.id).order("refund_requested_at", { ascending: false });
    setRefunds((rf ?? []) as Refund[]);
  };
  useEffect(() => { load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: unknown) => setEv((e: any) => ({ ...e, [k]: v }));
  const setV = (k: string, v: unknown) => setVenue((e: any) => ({ ...e, [k]: v }));
  const setTier = (i: number, k: keyof Tier, v: unknown) => setTiers(tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setTable = (i: number, k: keyof Table, v: unknown) => setTables(tables.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setPkg = (i: number, p: number, k: keyof Pkg, v: unknown) => setTable(i, "packages", tables[i].packages.map((x, q) => (q === p ? { ...x, [k]: v } : x)));
  const setDeal = (i: number, k: keyof Deal, v: unknown) => setDeals(deals.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setAddon = (i: number, k: keyof Addon, v: unknown) => setAddons(addons.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const makeFlash = async (pct: number, hours: number) => {
    setBusy(true);
    const { data, error } = await sb().rpc("create_flash_code", { p_event: ev.id, p_pct: pct, p_hours: hours, p_max_uses: 50 });
    setBusy(false);
    if (error) return toast(error.message);
    toast(t("flashMade").replace("{code}", String(data)).replace("{hours}", String(hours)));
    try { await navigator.clipboard.writeText(String(data)); } catch {}
    const { data: fc } = await sb().from("promo_codes").select("code,pct_off,ends_at,uses,max_uses").eq("event_id", ev.id).eq("source", "flash").eq("active", true).gt("ends_at", new Date().toISOString());
    setFlash(fc ?? []);
  };
  const policyKey = (p: any) => (!p || p.type === "none" ? "none" : p.type === "flexible" ? "flexible" : String(p.hours ?? 24));
  const policyOf = (k: string) => (k === "none" ? { type: "none" } : k === "flexible" ? { type: "flexible" } : { type: "until_hours_before", hours: Number(k) });

  const upload = async (fl: File | undefined) => {
    if (!fl || !ev) return;
    setBusy(true);
    const path = `${ev.id}/cover-${Date.now()}.${(fl.name.split(".").pop() || "jpg").toLowerCase()}`;
    const { error } = await sb().storage.from("covers").upload(path, fl, { upsert: true, contentType: fl.type });
    setBusy(false);
    if (error) return setErr(error.message);
    const url = `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
    set("cover_url", url);
    await sb().from("events").update({ cover_url: url }).eq("id", ev.id);
    toast(t("coverSaved"));
  };

  const save = async () => {
    if (!ev.title?.trim()) return setErr(t("needName"));
    setBusy(true); setErr("");
    let venueId = ev.venue_id;
    if (venue && (venue.name ?? "").trim()) {
      const row = { tenant_id: ev.tenant_id, name: venue.name.trim(), name_ar: venue.name_ar || null, city: venue.city || "Beirut", city_ar: venue.city_ar || null, address: venue.address || null, address_ar: venue.address_ar || null, lat: venue.lat === "" || venue.lat == null ? null : Number(venue.lat), lng: venue.lng === "" || venue.lng == null ? null : Number(venue.lng) };
      if (venue.id) await sb().from("venues").update(row).eq("id", venue.id);
      else { const { data: nv } = await sb().from("venues").insert(row).select("id").single(); venueId = nv?.id ?? venueId; if (nv) setVenue({ ...venue, id: nv.id }); }
    }
    const { error } = await sb().from("events").update({
      title: ev.title.trim(), title_ar: ev.title_ar || null, description: ev.description || null, description_ar: ev.description_ar || null,
      category: ev.category, kind: ev.kind, starts_at: fromLocal(ev.starts_at), doors_at: fromLocal(ev.doors_at), ends_at: fromLocal(ev.ends_at), status: ev.status,
      pinned: ev.pinned || null, pinned_ar: ev.pinned_ar || null, credit: ev.credit || null, refund_policy: ev.refund_policy ?? { type: "until_hours_before", hours: 24 }, seated: !!ev.seated,
      deals: deals.filter((d) => d.name?.trim()).map((d) => ({ ...d, id: d.id || rid() })), venue_id: venueId || null,
      addon_options: addons.filter((a) => a.name?.trim()).map((a) => ({ id: a.id || rid(), name: a.name.trim(), name_ar: a.name_ar || null, price: Math.max(0, +a.price || 0), per: a.per === "ticket" ? "ticket" : "order", max: Math.max(1, +(a.max ?? 4) || 4) })),
    }).eq("id", ev.id);
    if (error) { setBusy(false); return setErr(error.message); }
    for (const [i, x] of tiers.entries()) {
      const row = { name: (x.name ?? "").trim(), name_ar: x.name_ar || null, kind: x.kind, face_price: +x.face_price || 0, capacity: Math.max(+x.capacity || 0, (x.sold ?? 0) + (x.held ?? 0)), per_order_limit: +x.per_order_limit || (x.kind === "pass" ? 1 : 6), sale_starts: fromLocal(x.sale_starts), sale_ends: fromLocal(x.sale_ends), member_free: !!x.member_free, plan_months: x.kind === "pass" ? Number(x.plan_months || 1) : null, note: x.note || null, sort: i };
      if (x._del && x.id) { if (!x.sold && !x.held) await sb().from("tiers").delete().eq("id", x.id); continue; }
      if (x.id) await sb().from("tiers").update(row).eq("id", x.id);
      else if (row.name) await sb().from("tiers").insert({ event_id: ev.id, ...row });
    }
    for (const x of tables) {
      const row = { name: (x.name ?? "").trim(), name_ar: x.name_ar || null, seats: +x.seats || 4, min_spend: +x.min_spend || 0, deposit: +x.deposit || 0, packages: (x.packages ?? []).filter((p) => p.name?.trim()).map((p) => ({ ...p, id: p.id || rid(), price: +p.price || 0 })) };
      if (x._del && x.id) { if (!x.reserved_by_order) await sb().from("tables_vip").delete().eq("id", x.id); continue; }
      if (x.id) await sb().from("tables_vip").update(row).eq("id", x.id);
      else if (row.name) await sb().from("tables_vip").insert({ event_id: ev.id, ...row });
    }
    setBusy(false);
    toast(t("savedOk"));
    load();
  };

  const reopen = async (x: Tier) => {
    if (!x.id) return;
    await save();
    const { data: n, error } = await sb().rpc("notify_waitlist", { p_tier: x.id, p_reason: "reopened" });
    if (error) return setErr(error.message);
    toast(`${t("waitlistTold")} · ${n ?? 0}`);
    load();
  };
  const decide = async (id: string, decision: "refunded" | "declined") => {
    setBusy(true);
    const { error } = await sb().rpc("org_refund_order", { p_order: id, p_decision: decision });
    setBusy(false);
    if (error) return setErr(error.message);
    toast(decision === "refunded" ? t("refunded") : t("declined"));
    load();
  };
  const duplicate = async () => {
    setBusy(true);
    const { data, error } = await sb().from("events").insert({
      tenant_id: ev.tenant_id, organiser_id: ev.organiser_id, venue_id: ev.venue_id, slug: ev.slug.replace(/-[a-z0-9]{3}$/, "") + "-" + rid().slice(0, 3),
      title: ev.title + " (copy)", title_ar: ev.title_ar, description: ev.description, description_ar: ev.description_ar, category: ev.category, kind: ev.kind,
      starts_at: fromLocal(ev.starts_at), doors_at: fromLocal(ev.doors_at), ends_at: fromLocal(ev.ends_at), status: "draft", seated: ev.seated, refund_policy: ev.refund_policy, pinned: ev.pinned, pinned_ar: ev.pinned_ar, deals, cover_url: ev.cover_url,
    }).select("id").single();
    if (error || !data) { setBusy(false); return setErr(error?.message ?? "copy"); }
    if (tiers.some((x) => x.id)) await sb().from("tiers").insert(tiers.filter((x) => x.id && !x._del).map((x, i) => ({ event_id: data.id, name: x.name, name_ar: x.name_ar, kind: x.kind, face_price: +x.face_price || 0, capacity: +x.capacity || 0, per_order_limit: +x.per_order_limit || 6, member_free: !!x.member_free, plan_months: x.plan_months || null, note: x.note || null, sort: i })));
    if (tables.some((x) => x.id)) await sb().from("tables_vip").insert(tables.filter((x) => x.id && !x._del).map((x) => ({ event_id: data.id, name: x.name, name_ar: x.name_ar, seats: +x.seats || 4, min_spend: +x.min_spend || 0, deposit: +x.deposit || 0, packages: x.packages })));
    router.push(`/org/e/${data.id}`);
  };
  const archive = async () => { setBusy(true); await sb().from("events").update({ status: "archived" }).eq("id", ev.id); router.replace("/org"); };

  if (!ev) return (<><TopBar back="/org" title={t("manage")} /><main><div className="empty">{err || t("loading")}</div></main></>);

  const sold = tiers.reduce((a, x) => a + (x.sold ?? 0), 0);
  const cap = tiers.reduce((a, x) => a + (+x.capacity || 0), 0);
  const unit = (k: string) => t(k === "table" ? "covers" : k === "daypass" ? "sunbeds" : k === "stay" ? "rooms" : k === "item" ? "stock" : "seats");
  const pending = refunds.filter((r) => r.refund_status === "requested").length;

  return (
    <>
      <TopBar back="/org" title={t("manage")} right={<div className="row" style={{ gap: 6 }}><Link href={`/org/kit/${ev.id}`} className="btn xs line">{t("kit")}</Link><Link href={`/e/${ev.slug}`} className="btn xs line">{t("viewPublic")}</Link></div>} />
      <main>
        <div className="row between">
          <span className={`pill ${ev.status === "live" ? "ok" : ev.status === "draft" ? "gold" : ""}`}>{ev.status === "live" ? t("live") : ev.status === "draft" ? t("draftS") : t(ev.status) }</span>
          <span className="note num">{sold}/{cap} {t("soldLabel")}</span>
        </div>
        <div className="seg">
          {([["draft", t("draftS")], ["live", t("live")], ["archived", t("archived")]] as [string, string][]).map(([v, label]) => (
            <button key={v} className={ev.status === v ? "on" : ""} onClick={() => set("status", v)}>{label}</button>
          ))}
        </div>

        <div className="chips" style={{ overflowX: "auto" }}>
          {(["basics", "offers", "tables", "deals", "addons", "pricing", "refunds"] as const).filter((k) => (k !== "addons" || features.addons) && (k !== "pricing" || features.insights)).map((k) => (
            <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{t(`tab_${k}`)}{k === "refunds" && pending ? ` · ${pending}` : ""}</button>
          ))}
        </div>

        {tab === "basics" && (
          <>
            <div className="photo" style={{ height: 160, background: ev.cover_url ? `center/cover url(${ev.cover_url})` : "var(--g4)", borderRadius: 14, position: "relative" }} onClick={() => file.current?.click()}>
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
              <div style={{ position: "absolute", insetInlineEnd: 10, bottom: 10 }} className="btn sm line">{ev.cover_url ? t("changeCover") : t("addCover")}</div>
            </div>
            <div className="card pad stack">
              <label className="field"><span className="lbl">{t("evName")}</span><input value={ev.title ?? ""} onChange={(e) => set("title", e.target.value)} /></label>
              <label className="field"><span className="lbl">{t("evNameAr")}</span><input dir="rtl" value={ev.title_ar ?? ""} onChange={(e) => set("title_ar", e.target.value)} /></label>
              <div className="grid2">
                <label className="field"><span className="lbl">{t("listingKind")}</span><select value={ev.kind ?? "event"} onChange={(e) => set("kind", e.target.value)}>{LKINDS.map((k) => <option key={k} value={k}>{t(k === "event" ? "events" : k)}</option>)}</select></label>
                <label className="field"><span className="lbl">{t("category")}</span><select value={ev.category} onChange={(e) => set("category", e.target.value)}>{[...new Set([...LISTING_CATEGORIES, ev.category])].map((c) => <option key={c}>{c}</option>)}</select></label>
              </div>
              <div className="grid2">
                <label className="field"><span className="lbl">{t("dateTime")}</span><input type="datetime-local" value={toLocal(ev.starts_at)} onChange={(e) => set("starts_at", e.target.value)} /></label>
                <label className="field"><span className="lbl">{t("doors")}</span><input type="datetime-local" value={toLocal(ev.doors_at)} onChange={(e) => set("doors_at", e.target.value)} /></label>
              </div>
              {ev.kind !== "event" && <label className="field"><span className="lbl">{t("openUntil")}</span><input type="datetime-local" value={toLocal(ev.ends_at)} onChange={(e) => set("ends_at", e.target.value)} /></label>}
              <label className="field"><span className="lbl">{t("desc")}</span><textarea value={ev.description ?? ""} onChange={(e) => set("description", e.target.value)} /></label>
              <label className="field"><span className="lbl">{t("descAr")}</span><textarea dir="rtl" value={ev.description_ar ?? ""} onChange={(e) => set("description_ar", e.target.value)} /></label>
              <label className="field"><span className="lbl">{t("pinnedLine")}</span><input value={ev.pinned ?? ""} onChange={(e) => set("pinned", e.target.value)} placeholder={t("pinnedPh")} /></label>
              <label className="field"><span className="lbl">{t("pinnedLineAr")}</span><input dir="rtl" value={ev.pinned_ar ?? ""} onChange={(e) => set("pinned_ar", e.target.value)} /></label>
              <div className="grid2">
                <label className="field"><span className="lbl">{t("refundPolicy")}</span><select value={policyKey(ev.refund_policy)} onChange={(e) => set("refund_policy", policyOf(e.target.value))}>{POLICIES.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}</select></label>
                <label className="field"><span className="lbl">{t("photoCredit")}</span><input value={ev.credit ?? ""} onChange={(e) => set("credit", e.target.value)} placeholder="@marc.k" /></label>
              </div>
            </div>
            <div className="card pad stack">
              <div className="eyebrow">{t("venue")}</div>
              <div className="field"><select aria-label={t("venue")} value={venue?.id ?? ""} onChange={(e) => { const v = venues.find((x) => x.id === e.target.value); if (v) sb().from("venues").select("*").eq("id", v.id).single().then(({ data }) => { setVenue(data); set("venue_id", v.id); }); else setVenue({ name: "", city: "Beirut" }); }}>
                <option value="">— {t("newVenue")} —</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.city}</option>)}</select></div>
              <div className="grid2">
                <label className="field"><span className="lbl">{t("fName")}</span><input value={venue?.name ?? ""} onChange={(e) => setV("name", e.target.value)} /></label>
                <label className="field"><span className="lbl">{t("fNameAr")}</span><input dir="rtl" value={venue?.name_ar ?? ""} onChange={(e) => setV("name_ar", e.target.value)} /></label>
              </div>
              <div className="grid2">
                <label className="field"><span className="lbl">{t("city")}</span><input value={venue?.city ?? ""} onChange={(e) => setV("city", e.target.value)} /></label>
                <label className="field"><span className="lbl">{t("cityAr")}</span><input dir="rtl" value={venue?.city_ar ?? ""} onChange={(e) => setV("city_ar", e.target.value)} /></label>
              </div>
              <label className="field"><span className="lbl">{t("address")}</span><input value={venue?.address ?? ""} onChange={(e) => setV("address", e.target.value)} /></label>
              <label className="field"><span className="lbl">{t("addressAr")}</span><input dir="rtl" value={venue?.address_ar ?? ""} onChange={(e) => setV("address_ar", e.target.value)} /></label>
              <div className="grid2">
                <label className="field"><span className="lbl">Lat</span><input inputMode="decimal" value={venue?.lat ?? ""} onChange={(e) => setV("lat", e.target.value)} placeholder="33.89" /></label>
                <label className="field"><span className="lbl">Lng</span><input inputMode="decimal" value={venue?.lng ?? ""} onChange={(e) => setV("lng", e.target.value)} placeholder="35.50" /></label>
              </div>
            </div>
          </>
        )}

        {tab === "offers" && (
          <div className="stack">
            {tiers.map((x, i) => x._del ? null : (
              <div key={x.id ?? i} className="card pad stack">
                <div className="row between">
                  <select aria-label={t("tab_offers")} value={x.kind} onChange={(e) => setTier(i, "kind", e.target.value)} style={{ width: "auto" }}>{KINDS.filter((k) => k !== "table").map((k) => <option key={k} value={k} disabled={k === "pass" && !hasPlan(org?.plan, "venue")}>{t(k)}{k === "pass" && !hasPlan(org?.plan, "venue") ? " · Venue" : ""}</option>)}</select>
                  <span className="note num">{x.sold ?? 0} {t("soldLabel")}{waits[x.id ?? ""] ? ` · ${waits[x.id!]} ${t("waiting")}` : ""}</span>
                </div>
                <div className="grid2">
                  <label className="field"><span className="lbl">{t("tierName")}</span><input value={x.name ?? ""} onChange={(e) => setTier(i, "name", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("fNameAr")}</span><input dir="rtl" value={x.name_ar ?? ""} onChange={(e) => setTier(i, "name_ar", e.target.value)} /></label>
                </div>
                <div className="grid3">
                  <label className="field"><span className="lbl">{x.kind === "pass" ? `${t("price")} ${t("perMonth")}` : t("price")}</span><input inputMode="decimal" value={x.face_price} onChange={(e) => setTier(i, "face_price", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("fCap")} · {unit(x.kind)}</span><input inputMode="numeric" value={x.capacity} onChange={(e) => setTier(i, "capacity", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("fMax")}</span><input inputMode="numeric" value={x.per_order_limit ?? 6} onChange={(e) => setTier(i, "per_order_limit", e.target.value)} /></label>
                </div>
                <div className="grid2">
                  <label className="field"><span className="lbl">{t("saleStarts")}</span><input type="datetime-local" value={toLocal(x.sale_starts ?? null)} onChange={(e) => setTier(i, "sale_starts", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("saleEnds")}</span><input type="datetime-local" value={toLocal(x.sale_ends ?? null)} onChange={(e) => setTier(i, "sale_ends", e.target.value)} /></label>
                </div>
                {x.kind === "pass" && <label className="field"><span className="lbl">{t("planMonths")}</span><input inputMode="numeric" value={x.plan_months ?? 1} onChange={(e) => setTier(i, "plan_months", e.target.value)} /></label>}
                <label className="field"><span className="lbl">{t("tierNote")}</span><input value={x.note ?? ""} onChange={(e) => setTier(i, "note", e.target.value)} placeholder={t("tierNotePh")} /></label>
                <label className="row" style={{ justifyContent: "flex-start", gap: 8, fontSize: 13 }}><input type="checkbox" checked={!!x.member_free} onChange={(e) => setTier(i, "member_free", e.target.checked)} /> {t("membersFree")}</label>
                <div className="note num">{+x.face_price > 0 ? `${t("buyerSees")} ${money(allInKind(x.kind, +x.face_price))} ${x.kind === "stay" ? t("perNight") : x.kind === "pass" ? t("perMonth") : t("allIn")}` : t("free")}</div>
                <div className="row" style={{ gap: 8 }}>
                  {!!x.id && <button className="btn xs line" onClick={() => reopen(x)} disabled={busy}>{t("reopenTier")}</button>}
                  {!x.sold && !x.held && <button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => (x.id ? setTier(i, "_del", true) : setTiers(tiers.filter((_, j) => j !== i)))}>{t("remove")}</button>}
                </div>
              </div>
            ))}
            <button className="btn line" onClick={() => setTiers([...tiers, { name: "", kind: ev.kind === "stay" ? "stay" : ev.kind === "venue" ? "daypass" : "ticket", face_price: 20, capacity: 100, sold: 0, held: 0, per_order_limit: 6 }])}>{t("addOffer")}</button>
          </div>
        )}

        {tab === "tables" && (
          <div className="stack">
            <div className="small">{t("tableNote")}</div>
            {tables.map((x, i) => x._del ? null : (
              <div key={x.id ?? i} className="card pad stack">
                <div className="grid2">
                  <label className="field"><span className="lbl">{t("tableName")}</span><input value={x.name ?? ""} onChange={(e) => setTable(i, "name", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("fNameAr")}</span><input dir="rtl" value={x.name_ar ?? ""} onChange={(e) => setTable(i, "name_ar", e.target.value)} /></label>
                </div>
                <div className="grid3">
                  <label className="field"><span className="lbl">{t("seats")}</span><input inputMode="numeric" value={x.seats} onChange={(e) => setTable(i, "seats", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("minSpend")} $</span><input inputMode="decimal" value={x.min_spend} onChange={(e) => setTable(i, "min_spend", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("deposit")} $</span><input inputMode="decimal" value={x.deposit} onChange={(e) => setTable(i, "deposit", e.target.value)} /></label>
                </div>
                <div className="eyebrow">{t("packages")}</div>
                {(x.packages ?? []).map((p, q) => (
                  <div key={p.id} className="grid3 cols3">
                    <input value={p.name} onChange={(e) => setPkg(i, q, "name", e.target.value)} placeholder={t("pkgName")} />
                    <input dir="rtl" value={p.name_ar ?? ""} onChange={(e) => setPkg(i, q, "name_ar", e.target.value)} placeholder={t("fNameAr")} />
                    <input inputMode="decimal" value={p.price} onChange={(e) => setPkg(i, q, "price", e.target.value)} placeholder="$" />
                  </div>
                ))}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn xs line" onClick={() => setTable(i, "packages", [...(x.packages ?? []), { id: rid(), name: "", name_ar: "", price: 150 }])}>{t("addPackage")}</button>
                  {x.reserved_by_order ? <span className="tag">{t("booked")}</span> : <button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => (x.id ? setTable(i, "_del", true) : setTables(tables.filter((_, j) => j !== i)))}>{t("remove")}</button>}
                </div>
              </div>
            ))}
            <button className="btn line" onClick={() => setTables([...tables, { name: `Table ${tables.length + 1}`, seats: 6, min_spend: 300, deposit: 100, packages: [] }])}>{t("addTable")}</button>
          </div>
        )}

        {tab === "deals" && (
          <div className="stack">
            <div className="small">{t("dealsNote")}</div>
            {deals.map((d, i) => (
              <div key={d.id} className="card pad stack">
                <label className="field"><span className="lbl">{t("deal")}</span><input value={d.name} onChange={(e) => setDeal(i, "name", e.target.value)} placeholder="Bring a friend free this Friday" /></label>
                <label className="field"><span className="lbl">{t("fNameAr")}</span><input dir="rtl" value={d.name_ar ?? ""} onChange={(e) => setDeal(i, "name_ar", e.target.value)} /></label>
                <div className="row between">
                  <label className="row" style={{ gap: 8, fontSize: 13 }}><input type="checkbox" checked={!!d.member_only} onChange={(e) => setDeal(i, "member_only", e.target.checked)} /> {t("memberPrice")}</label>
                  <button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => setDeals(deals.filter((_, j) => j !== i))}>{t("remove")}</button>
                </div>
              </div>
            ))}
            <button className="btn line" onClick={() => setDeals([...deals, { id: rid(), name: "", name_ar: "" }])}>{t("addDeal")}</button>
          </div>
        )}

        {tab === "addons" && (
          <div className="stack">
            <div className="small">{t("addonsNote")}</div>
            {addons.map((a, i) => (
              <div key={a.id} className="card pad stack">
                <div className="grid2">
                  <label className="field"><span className="lbl">{t("addonName")}</span><input value={a.name} onChange={(e) => setAddon(i, "name", e.target.value)} placeholder={t("fastLane")} /></label>
                  <label className="field"><span className="lbl">{t("fNameAr")}</span><input dir="rtl" value={a.name_ar ?? ""} onChange={(e) => setAddon(i, "name_ar", e.target.value)} /></label>
                </div>
                <div className="grid2">
                  <label className="field"><span className="lbl">{t("price")}</span><input inputMode="decimal" value={a.price} onChange={(e) => setAddon(i, "price", e.target.value)} /></label>
                  <label className="field"><span className="lbl">{t("addonMax")}</span><input inputMode="numeric" value={a.max ?? 4} onChange={(e) => setAddon(i, "max", e.target.value)} /></label>
                </div>
                <div className="row between">
                  <div className="seg" style={{ maxWidth: 220 }}>
                    <button className={a.per === "order" ? "on" : ""} onClick={() => setAddon(i, "per", "order")}>{t("addonPer")} {t("perOrder")}</button>
                    <button className={a.per === "ticket" ? "on" : ""} onClick={() => setAddon(i, "per", "ticket")}>{t("addonPer")} {t("perTicket2")}</button>
                  </div>
                  <button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => setAddons(addons.filter((_, j) => j !== i))}>{t("remove")}</button>
                </div>
              </div>
            ))}
            <div className="grid2">
              <button className="btn line" onClick={() => setAddons([...addons, { id: rid(), name: t("fastLane"), price: 10, per: "ticket", max: 6 }])}>⚡ {t("fastLane")}</button>
              <button className="btn line" onClick={() => setAddons([...addons, { id: rid(), name: t("parking"), price: 5, per: "order", max: 2 }])}>🅿️ {t("parking")}</button>
            </div>
            <button className="btn line" onClick={() => setAddons([...addons, { id: rid(), name: "", price: 5, per: "order", max: 4 }])}>{t("addAddon")}</button>
          </div>
        )}

        {tab === "pricing" && (
          <div className="stack">
            <div className="small">{t("pricingSub")}</div>
            {pace === null && <div className="empty">{t("loading")}</div>}
            {pace && !pace.length && <div className="empty">{t("noPace")}</div>}
            {(pace ?? []).map((r) => {
              const a = tierAdvice(r);
              const tone = a.state === "slow" ? "var(--amber)" : a.state === "hot" ? "var(--g1)" : "var(--ink2)";
              const label = t(a.state === "slow" ? "paceSlow" : a.state === "hot" ? "paceHot" : a.state === "soldout" ? "paceSoldOut" : a.state === "past" ? "pacePast" : "paceTrack");
              const body = a.state === "slow" ? t("paceSlowB").replace("{pct}", String(a.pct)) : a.state === "hot" ? t("paceHotB").replace("{pct}", String(a.raise)) : a.state === "track" ? t("paceTrackB") : "";
              return (
                <div key={r.tier_id} className="card pad">
                  <div className="row between">
                    <div><div className="title" style={{ fontSize: 15 }}>{r.name} · {money(Number(r.face_price))}</div><div className="meta">{Number(r.sold) + Number(r.held)}/{r.capacity} {t("paceSold")} · {r.sold_7d} {t("paceWeek")} · {r.sold_1d} {t("paceDay")}</div></div>
                    <span className="tag" style={{ background: tone, color: "#fff" }}>{label}</span>
                  </div>
                  {a.state !== "past" && a.state !== "soldout" && (
                    <div className="meter" style={{ marginTop: 8 }}>
                      <span>{a.pct}% {t("paceProjected")} · {a.daysLeft} {t("paceDaysLeft")}</span>
                      <div className="bar"><b style={{ width: `${Math.min(100, a.pct)}%`, background: tone }} /></div>
                    </div>
                  )}
                  {body && <p className="small" style={{ margin: "8px 0 0" }}>{body}</p>}
                  {a.flash && <button className="btn sm red" style={{ marginTop: 8 }} disabled={busy} onClick={() => makeFlash(a.flash!.pct, a.flash!.hours)}>⚡ {t("flashBtn").replace("{pct}", String(a.flash.pct)).replace("{hours}", String(a.flash.hours))}</button>}
                </div>
              );
            })}
            {flash.length > 0 && (
              <div className="card pad">
                <div className="eyebrow">{t("flashActive")}</div>
                {flash.map((f) => <div key={f.code} className="row between" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><b className="num">{f.code}</b><span className="small">−{f.pct_off}% · {f.uses}/{f.max_uses} · {new Date(f.ends_at).toLocaleString(lang === "ar" ? "ar-LB" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>)}
                <Link href="/org/codes" className="small" style={{ color: "var(--g1)", fontWeight: 600, display: "inline-block", marginTop: 8 }}>{t("promoCodes")} →</Link>
              </div>
            )}
          </div>
        )}

        {tab === "refunds" && (
          <div className="stack">
            {!refunds.length && <div className="empty">{t("noRefunds")}</div>}
            {refunds.map((r) => (
              <div key={r.id} className="card pad">
                <div className="row between">
                  <div><div className="title" style={{ fontSize: 14 }}>{r.buyer ?? "—"} · {money(Number(r.total))}</div><div className="meta">{r.payment_method} · {new Date(r.refund_requested_at).toLocaleString(lang === "ar" ? "ar-LB" : "en-GB")}{(r.addons ?? []).some((a: any) => a.kind === "refund_protection") ? ` · ${t("protected")}` : ""}</div></div>
                  <span className={`tag ${r.refund_status === "refunded" ? "ok" : r.refund_status === "declined" ? "" : "gold"}`}>{t(r.refund_status === "requested" ? "requested" : r.refund_status)}</span>
                </div>
                {r.refund_status === "requested" && <div className="grid2" style={{ marginTop: 8 }}><button className="btn sm green" disabled={busy} onClick={() => decide(r.id, "refunded")}>{t("approveRefund")}</button><button className="btn sm line" disabled={busy} onClick={() => decide(r.id, "declined")}>{t("decline")}</button></div>}
              </div>
            ))}
          </div>
        )}

        {err && <div className="err">{err}</div>}
        <button className="btn green" disabled={busy} onClick={save}>{t("saveChanges")}</button>
        <Link className="btn red" href={`/org/promote/${ev.id}`}>★ {t("promote")}</Link>
        <div className="grid2">
          <button className="btn line" disabled={busy} onClick={duplicate}>{t("duplicate")}</button>
          <Link className="btn line" href={`/story/${ev.slug}`}>{t("story")}</Link>
        </div>
        <button className="btn line" style={{ color: "var(--red-dark)" }} disabled={busy} onClick={archive}>{t("archive")}</button>
      </main>
    </>
  );
}
