"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { sb } from "@/lib/supabase-browser";
import { useToast } from "@/components/Toast";
import { allInKind, unitFee, money, lbp, type OfferKind } from "@/lib/config";
import { useLang, useT, useCur } from "@/lib/lang";
import { left as leftOf, isAccess, type Tier, type Table, type Deal, type AddonOption } from "@/lib/catalogue";
import CalendarSheet from "@/components/CalendarSheet";
import { useConfig } from "@/components/Config";

export type CartLine = { tier_id: string; name: string; kind: OfferKind; qty: number; face: number; unit: number; fee: number; covered: boolean; note: string | null; plan_months: number | null };
export type Cart = {
  listing: { id: string; slug: string; title: string; kind: string };
  lines: CartLine[];
  table: { id: string; name: string; deposit: number; party: number | null; time: string | null; package?: { id: string; name: string; price: number } | null } | null;
  gift: { name: string; phone: string } | null;
  method: "card" | "cash_door" | null;
  checkin: string | null;
  squad_id?: string | null;
  addons?: CartAddon[];
};
export type CartAddon = { id: string; name: string; qty: number; unit: number; per: "order" | "ticket" };
const SLOTS = ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
const nextFriday = () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); };

/** Offer pickers by type (brief §5.4). Pickers change shape by type; nothing else does. The cart lives in sessionStorage until checkout. */
export default function OfferPicker({ listing, tiers, tables: tablesIn, deals: dealsIn, addons: addonsIn = [], preset }: { listing: Cart["listing"] & { status: string; organiser: string; organiserWa?: string | null }; tiers: Tier[]; tables: Table[]; deals: Deal[]; addons?: AddonOption[]; preset?: { tier: string; qty: number; entry?: string } }) {
  const t = useT();
  const lang = useLang();
  const { features } = useConfig();
  const cur0 = useCur();
  const cur = features.currency_lbp ? cur0 : "USD";
  // the back office decides which offers a tenant sells (tenants.config.features)
  const tables = features.tables ? tablesIn : [];
  const deals = features.deals ? dealsIn : [];
  const toast = useToast();
  const router = useRouter();
  // a WhatsApp concierge link (?tier=&qty=) arrives with the offer preselected
  // a WhatsApp concierge link (?tier=&qty=&entry=) arrives with the offer preselected — and its entrance beside it (access first, v6)
  const [qty, setQty] = useState<Record<string, number>>(() => {
    if (!preset || !tiers.some((t) => t.id === preset.tier)) return {};
    const out: Record<string, number> = { [preset.tier]: Math.min(preset.qty, tiers.find((t) => t.id === preset.tier)?.per_order_limit || 6) };
    const e = preset.entry ? tiers.find((t) => t.id === preset.entry && isAccess(t)) : null;
    if (e) out[e.id] = Math.min(preset.qty, e.per_order_limit || 6);
    return out;
  });
  const [group, setGroup] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [party, setParty] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [pkg, setPkg] = useState<string | null>(null);
  const [checkin, setCheckin] = useState(nextFriday());
  const [cal, setCal] = useState(false);
  const [gift, setGift] = useState<{ on: boolean; name: string; phone: string }>({ on: false, name: "", phone: "" });
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [user, setUser] = useState<User | null>(null);
  const [hasPass, setHasPass] = useState(false);
  const [heldAccess, setHeldAccess] = useState(0); // people the buyer can already bring in here (tickets, day pass today, stay, membership)
  const [notify, setNotify] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [ref, setRef] = useState("");
  const name = (x: { name: string; name_ar: string | null }) => (lang === "ar" && x.name_ar ? x.name_ar : x.name);
  const dname = (d: Deal) => (lang === "ar" && d.name_ar ? d.name_ar : d.name);

  useEffect(() => {
    try { setRef(localStorage.getItem("wu-ref") ?? ""); } catch {}
    sb().auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) return;
      const [{ data: pass }, { data: held }, { data: wl }, { data: sd }] = await Promise.all([
        sb().rpc("my_pass_covers", { p_event: listing.id }),
        sb().rpc("my_access", { p_event: listing.id }),
        sb().from("waitlist").select("tier_id").eq("user_id", data.user.id),
        sb().from("saved_deals").select("deal_id").eq("user_id", data.user.id).eq("event_id", listing.id),
      ]);
      setHasPass(!!pass);
      setHeldAccess(Number(held ?? 0));
      setNotify(Object.fromEntries((wl ?? []).map((w: any) => [w.tier_id, true])));
      setSaved(Object.fromEntries((sd ?? []).map((s: any) => [s.deal_id, true])));
    });
  }, [listing.id]);

  const passTiers = tiers.filter((x) => x.kind === "pass");
  const otherTiers = tiers.filter((x) => x.kind !== "pass");
  // Access first (v6): entry offers admit people; services are for people inside
  const mainTiers = otherTiers.filter(isAccess);
  const itemTiers = otherTiers.filter((x) => !isAccess(x));
  const table = tables.find((x) => x.id === tableId) ?? null;

  const lines: CartLine[] = useMemo(() => {
    const out: CartLine[] = [];
    for (const x of otherTiers) {
      const q = qty[x.id] ?? 0;
      if (!q) continue;
      const covered = x.member_free && hasPass;
      const face = covered ? 0 : Number(x.face_price);
      out.push({ tier_id: x.id, name: name(x), kind: x.kind, qty: q, face: Number(x.face_price), unit: face, fee: unitFee(x.kind, face), covered, note: x.note, plan_months: null });
    }
    if (plan) {
      const x = passTiers.find((p) => p.id === plan)!;
      out.push({ tier_id: x.id, name: name(x), kind: "pass", qty: 1, face: Number(x.face_price), unit: Number(x.face_price), fee: 0, covered: false, note: null, plan_months: x.plan_months });
    }
    return out;
  }, [qty, plan, hasPass, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = lines.reduce((a, l) => a + (l.kind === "stay" ? 1 : l.qty), 0);
  const pkgRow = table && pkg ? (table.packages ?? []).find((p) => p.id === pkg) ?? null : null;
  // people this order lets in: entry lines × admits, plus the table's party when the table includes entry
  const tableEntry = !!table && table.includes_entry !== false;
  const admittedInCart = lines.reduce((a, l) => { const x = tiers.find((y) => y.id === l.tier_id); return a + (x && isAccess(x) ? Number(x.admits ?? 1) * l.qty : 0); }, 0) + (tableEntry ? Math.max(1, party ?? table!.seats ?? 1) : 0);
  const headcount = admittedInCart || heldAccess;
  const inside = headcount > 0;
  const needsEntry = (x: { requires_access?: boolean }) => x.requires_access !== false;
  const cheapestEntry = [...mainTiers].filter((x) => leftOf(x) > 0 && !(qty[x.id] ?? 0)).sort((a, b) => Number(a.face_price) - Number(b.face_price))[0] ?? null;
  // add-ons (fast lane, parking…): per-ticket ones follow the headcount, per-order ones are a quantity the buyer picks
  const ticketCount = headcount;
  const cartAddons: CartAddon[] = addonsIn.filter((a) => (addonQty[a.id] ?? 0) > 0 && (inside || !needsEntry(a))).map((a) => ({ id: a.id, name: lang === "ar" && a.name_ar ? a.name_ar : a.name, qty: a.per === "ticket" ? Math.min(ticketCount, addonQty[a.id] ?? 0) : addonQty[a.id] ?? 0, unit: Number(a.price), per: a.per })).filter((a) => a.qty > 0);
  const addonTotal = cartAddons.reduce((a, x) => a + x.qty * x.unit, 0);
  const total = lines.reduce((a, l) => a + (l.unit + l.fee) * l.qty, 0) + (table ? Number(table.deposit) + Number(pkgRow?.price ?? 0) : 0) + addonTotal;
  const tableReady = !!table && (!table.seats || !!party) && !!time;
  const serviceWithoutEntry = !inside && (lines.some((l) => { const x = tiers.find((y) => y.id === l.tier_id); return x && !isAccess(x) && needsEntry(x); }) || (tableReady && !tableEntry));
  const canBook = (lines.length > 0 || tableReady) && !serviceWithoutEntry;
  const giftable = features.gifts && lines.some((l) => ["ticket", "daypass", "item"].includes(l.kind));

  const bump = (x: Tier, d: number) => {
    const service = !isAccess(x) && needsEntry(x);
    if (service && !inside && d > 0) { toast(t("entryFirstHint")); return; }
    const max = Math.min(x.per_order_limit || 6, leftOf(x), service && x.per === "person" ? headcount : Infinity);
    const next = (qty[x.id] ?? 0) + d;
    if (next > max) { toast(`${t("limitHit")} (${max}). ${t("groupBooking")} ↓`); setGroup((g) => ({ ...g, [x.id]: true })); return; }
    setQty((s) => ({ ...s, [x.id]: Math.max(0, next) }));
  };
  const toggleNotify = async (x: Tier) => {
    if (!user) return router.push(`/login?next=/e/${listing.slug}`);
    if (notify[x.id]) { await sb().from("waitlist").delete().eq("tier_id", x.id).eq("user_id", user.id); setNotify((n) => ({ ...n, [x.id]: false })); toast(t("notifyOff")); }
    else { await sb().from("waitlist").upsert({ tier_id: x.id, user_id: user.id, qty: 1 }); setNotify((n) => ({ ...n, [x.id]: true })); toast(t("notifyOn")); }
  };
  const saveDeal = async (d: Deal) => {
    if (!user) return router.push(`/login?next=/e/${listing.slug}`);
    if (saved[d.id]) return;
    const { error } = await sb().from("saved_deals").insert({ user_id: user.id, event_id: listing.id, deal_id: d.id });
    if (error) return toast(error.message);
    setSaved((s) => ({ ...s, [d.id]: true }));
    toast(t("saved"));
  };
  const checkout = (method: Cart["method"]) => {
    const cart: Cart = {
      listing: { id: listing.id, slug: listing.slug, title: listing.title, kind: listing.kind },
      lines, table: table ? { id: table.id, name: name(table), deposit: Number(table.deposit), party, time, package: pkgRow ? { id: pkgRow.id, name: name(pkgRow as any), price: Number(pkgRow.price) } : null } : null,
      gift: gift.on && gift.name ? { name: gift.name, phone: gift.phone } : null, method, checkin: lines.some((l) => l.kind === "stay") ? checkin : null,
      addons: cartAddons,
    };
    sessionStorage.setItem("wu-cart", JSON.stringify(cart));
    router.push("/checkout");
  };
  const sel = (x: Tier) => !!qty[x.id];
  const ended = listing.status === "ended";
  const groupWa = (x: Tier) => {
    const to = (listing.organiserWa ?? "").replace(/\D/g, "");
    const text = encodeURIComponent(`${t("groupBooking")} · ${listing.title} · ${name(x)} · ${(qty[x.id] ?? 0) + 1}+ · ${typeof location !== "undefined" ? location.origin : ""}/e/${listing.slug}`);
    return to ? `https://wa.me/${to}?text=${text}` : `https://wa.me/?text=${text}`;
  };
  const split = async () => {
    if (!user) return router.push(`/login?next=/e/${listing.slug}`);
    const l = lines.find((x) => ["ticket", "daypass", "item"].includes(x.kind));
    if (!l) return toast(t("splitOnlyTickets"));
    router.push(`/squad/new?event=${listing.id}&tier=${l.tier_id}`);
  };

  const renderTier = (x: Tier) => {
        const left = leftOf(x);
        const soldOut = left <= 0;
        const covered = x.member_free && hasPass;
        const q = qty[x.id] ?? 0;
        const service = !isAccess(x);
        const gated = service && needsEntry(x) && !inside;
        const max = Math.min(x.per_order_limit || 6, left, service && needsEntry(x) && x.per === "person" ? headcount : Infinity);
        const unitLabel = x.kind === "stay" ? t("perNight") : service && x.per === "person" ? t("perPerson") : "";
        return (
          <div key={x.id} className={`offer ${sel(x) ? "sel" : ""} ${soldOut ? "sold" : ""}`}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title" style={{ fontSize: 15 }}>{name(x)}</div>
                <div className="meta">
                  {Number(x.face_price) === 0 ? t("free") : covered ? <><s>{money(Number(x.face_price))}</s> {t("youAreMember")}</> : `${money(allInKind(x.kind, Number(x.face_price)))}${cur === "LBP" ? ` ≈ ${lbp(allInKind(x.kind, Number(x.face_price)))}` : ""} ${unitLabel}`}
                  {!covered && Number(x.face_price) > 0 && x.kind !== "stay" ? <span className="small"> {t("allIn")}</span> : null}
                  {left < 50 && x.capacity < 5000 && <> · <span style={{ color: soldOut ? "var(--red-dark)" : "var(--ink2)" }}>{soldOut ? t("soldOut") : `${left} ${t(x.kind === "stay" ? "rooms" : "left")}`}</span></>}
                  {x.member_free && !covered && <> · <span style={{ color: "var(--g1)" }}>{t("membersFree")}</span></>}
                  {!service && Number(x.admits ?? 1) > 1 && <> · <span style={{ color: "var(--g1)" }}>{t("admits")} {x.admits}</span></>}
                  {service && !needsEntry(x) && <> · <span className="small">{t("noEntryNeeded")}</span></>}
                </div>
                {gated && cheapestEntry && (
                  <button className="btn xs line" style={{ marginTop: 6 }} onClick={() => setQty((s) => ({ ...s, [cheapestEntry.id]: 1 }))}>{t("needsEntry")} · {t("addEntry")} {name(cheapestEntry)} · {money(allInKind(cheapestEntry.kind, Number(cheapestEntry.face_price)))}</button>
                )}
                {gated && !cheapestEntry && <div className="small" style={{ marginTop: 4, color: "var(--red-dark)" }}>{t("needsEntry")}</div>}
                {x.note && <div className="small" style={{ marginTop: 2 }}>{x.note}</div>}
                {!soldOut && x.kind !== "stay" && <div className="small" style={{ marginTop: 4 }}>{t("maxPer")}: {x.per_order_limit || 6}</div>}
                {x.kind === "stay" && (
                  <div className="row start" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                    <button className="btn xs line" onClick={() => setCal(true)}>📅 {checkin}{q ? ` → ${q} ${t("nights")}` : ` · ${t("pickDates")}`}</button>
                    {cal && <CalendarSheet checkin={checkin} nights={q} onChange={(c, n) => { setCheckin(c); setQty((s) => ({ ...s, [x.id]: Math.min(n, Math.max(1, Math.min(x.per_order_limit || 14, leftOf(x)))) })); }} onClose={() => setCal(false)} />}
                  </div>
                )}
                {group[x.id] && (
                  <div className="gift" style={{ background: "var(--sand)", borderColor: "var(--sand)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t("groupBooking")}</div>
                    <div className="meta">{t("groupNote")}</div>
                    <a className="btn green sm" style={{ marginTop: 8 }} href={groupWa(x)} target="_blank" rel="noopener" onClick={() => { toast(t("groupSent")); setGroup((g) => ({ ...g, [x.id]: false })); }}>{t("groupBooking")} · WhatsApp</a>
                  </div>
                )}
              </div>
              {soldOut ? (
                <button className={`btn ${notify[x.id] ? "line" : "green"} sm`} onClick={() => toggleNotify(x)}>{notify[x.id] ? "✓ " : "🔔 "}{t("notifyMe")}</button>
              ) : !ended && (
                <div className="qty">
                  <button onClick={() => bump(x, -1)} aria-label="Fewer" disabled={!q}>−</button>
                  <span className="num">{q}</span>
                  <button className="plus" onClick={() => bump(x, 1)} aria-label="More" disabled={gated || (q >= max && !group[x.id])}>+</button>
                </div>
              )}
            </div>
          </div>
        );
      };

  return (
    <div>
      <h2 style={{ margin: "4px 0 0" }}>{t("offersHere")}</h2>
      {ended && <p className="small">{t("ended")}</p>}

      {(mainTiers.length > 0 && (itemTiers.length > 0 || tables.length > 0)) && <div className="small" style={{ margin: "8px 0 2px", fontWeight: 600 }}>{t("entryHeading")}</div>}
      {mainTiers.map(renderTier)}

      {passTiers.length > 0 && (
        <div className={`offer pass ${plan ? "sel" : ""}`}>
          <div className="title" style={{ fontSize: 15 }}>{t("pass")}</div>
          <div className="meta" style={{ color: "var(--g1)" }}>{t("passPerks")}</div>
          <div className="grid3" style={{ marginTop: 8 }}>
            {passTiers.map((x) => (
              <button key={x.id} className={`plan ${plan === x.id ? "on" : ""}`} onClick={() => setPlan(plan === x.id ? null : x.id)}>
                <b>{money(Number(x.face_price))}</b>{name(x)}
              </button>
            ))}
          </div>
        </div>
      )}

      {tables.map((x) => {
        const on = tableId === x.id;
        const sizes = Array.from({ length: Math.max(1, x.seats - 1) }, (_, i) => i + 2).filter((n) => n <= x.seats);
        return (
          <div key={x.id} className={`offer ${on ? "sel" : ""}`}>
            <button className="row" style={{ width: "100%", alignItems: "flex-start" }} onClick={() => { setTableId(on ? null : x.id); setParty(null); setTime(null); setPkg(null); }}>
              <div style={{ flex: 1 }}>
                <div className="title" style={{ fontSize: 15 }}>{name(x)}</div>
                <div className="meta">
                  {x.seats} {t("seats")} · {Number(x.deposit) ? `${money(Number(x.deposit))} ${t("deposit")}` : t("noBookingFee")}
                  {Number(x.min_spend) ? ` · ${money(Number(x.min_spend))} ${t("minSpend")}` : ""}
                  {mainTiers.length > 0 ? ` · ${t(x.includes_entry === false ? "entryNotIncluded" : "entryIncluded")}` : ""}
                </div>
              </div>
              <span className="tag">{t("table")}</span>
            </button>
            {on && (
              <>
                <div className="small" style={{ marginTop: 8 }}>{t("partySize")}</div>
                <div className="slots">{sizes.map((n) => <button key={n} className={`slot ${party === n ? "on" : ""}`} onClick={() => setParty(party === n ? null : n)}>{n}</button>)}</div>
                <div className="small" style={{ marginTop: 8 }}>{t("time")}</div>
                <div className="slots">{SLOTS.map((s) => <button key={s} className={`slot ${time === s ? "on" : ""}`} onClick={() => setTime(time === s ? null : s)}>{s}</button>)}</div>
                {(x.packages ?? []).length > 0 && (
                  <>
                    <div className="small" style={{ marginTop: 8 }}>{t("packages")}</div>
                    <div className="slots">{(x.packages ?? []).map((p) => <button key={p.id} className={`slot ${pkg === p.id ? "on" : ""}`} onClick={() => setPkg(pkg === p.id ? null : p.id)}>{name(p as any)} · {money(Number(p.price))}</button>)}</div>
                  </>
                )}
                {Number(x.deposit) > 0 && party && <div className="small" style={{ marginTop: 6, color: "var(--g1)" }}>{t("hold")} {money(Number(x.deposit))}. {t("holdNote")}</div>}
              </>
            )}
          </div>
        );
      })}

      {itemTiers.length > 0 && (
        <>
          <div className="small" style={{ margin: "10px 0 2px", fontWeight: 600 }}>{t("onceIn")}</div>
          <div className="small" style={{ marginBottom: 6, color: inside ? "var(--g1)" : "var(--ink2)" }}>{inside ? (admittedInCart ? `${headcount} ${t("people")}` : `✓ ${t("youreIn")}`) : t("onceInNote")}</div>
          {itemTiers.map((x) => renderTier(x))}
        </>
      )}

      {deals.map((d) => (
        <div key={d.id} className="offer" style={{ borderStyle: "dashed" }}>
          <div className="row">
            <div style={{ flex: 1 }}>
              <div className="title" style={{ fontSize: 15 }}>{dname(d)}</div>
              <div className="meta">{d.member_only ? `${t("memberPrice")} · ` : ""}{t("deal")} · {t("redeemBy")}</div>
            </div>
            <button className={`btn ${saved[d.id] ? "line" : "green"} sm`} onClick={() => saveDeal(d)}>{saved[d.id] ? "✓" : t("save")}</button>
          </div>
        </div>
      ))}

      {addonsIn.length > 0 && (lines.length > 0 || table) && (
        <div className="offer" style={{ background: "var(--sand)", borderColor: "var(--sand)" }}>
          <div className="title" style={{ fontSize: 14, marginBottom: 4 }}>⚡ {t("addonsPick")}</div>
          {!inside && addonsIn.some(needsEntry) && <div className="small" style={{ marginBottom: 4 }}>{t("entryFirstHint")}</div>}
          {addonsIn.map((a) => {
            const gatedA = needsEntry(a) && !inside;
            const max = gatedA ? 0 : a.per === "ticket" ? Math.max(0, ticketCount) : Math.max(1, Number(a.max ?? 4));
            const q = Math.min(addonQty[a.id] ?? 0, max);
            return (
              <div key={a.id} className="row" style={{ padding: "6px 0" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{lang === "ar" && a.name_ar ? a.name_ar : a.name}</div><div className="meta">{money(Number(a.price))} · {a.per === "ticket" ? t("perTicket2") : t("perOrder")}</div></div>
                <div className="qty"><button aria-label="−" onClick={() => setAddonQty((s) => ({ ...s, [a.id]: Math.max(0, q - 1) }))}>−</button><span className="num">{q}</span><button aria-label="+" disabled={q >= max} onClick={() => setAddonQty((s) => ({ ...s, [a.id]: Math.min(max, q + 1) }))}>+</button></div>
              </div>
            );
          })}
        </div>
      )}

      {giftable && (
        <div className="gift">
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={gift.on} onChange={(e) => setGift({ ...gift, on: e.target.checked })} style={{ width: 18, height: 18 }} />🎁 {t("giftThis")}
          </label>
          {gift.on && (
            <>
              <input placeholder={t("giftTo")} value={gift.name} onChange={(e) => setGift({ ...gift, name: e.target.value })} />
              <input placeholder={t("giftPhone")} inputMode="tel" value={gift.phone} onChange={(e) => setGift({ ...gift, phone: e.target.value })} />
              <div className="small" style={{ marginTop: 8 }}>{t("giftNote")}</div>
            </>
          )}
        </div>
      )}

      {serviceWithoutEntry && <p className="small" style={{ margin: "12px 0 0", color: "var(--red-dark)" }}>{t("entryFirstHint")}</p>}
      {canBook && (
        <>
          <p className="small" style={{ margin: "12px 0 10px" }}>
            {t("total")} {money(total)}{total && cur === "LBP" ? ` ≈ ${lbp(total)}` : ""}{total ? ` ${t("allIn")}` : ""}. {t("feesNote")}{ref ? <span style={{ color: "var(--g1)" }}> {t("refApplied")} {ref}.</span> : null}
          </p>
          <div className="grid2">
            {total > 0 ? (
              <>
                <button className="btn red" onClick={() => checkout("card")}>{t("payCard")}</button>
                <button className="btn line" onClick={() => checkout("cash_door")}>{t("payCash")}</button>
                {features.squads && count > 1 && <button className="btn line" style={{ gridColumn: "span 2" }} onClick={split}>👥 {t("splitPay")} · {count}</button>}
              </>
            ) : (
              <button className="btn red" style={{ gridColumn: "span 2" }} onClick={() => checkout("card")}>{table ? t("confirm") : t("reserve")}</button>
            )}
          </div>
          {!user && <p className="small" style={{ textAlign: "center", margin: "8px 0 0" }}>{t("signInFirst")} <Link href={`/login?next=/e/${listing.slug}`} style={{ color: "var(--g1)", fontWeight: 600 }}>{t("signIn")}</Link></p>}
        </>
      )}
    </div>
  );
}
