"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Facet } from "./Band";
import { useToast } from "./Toast";
import { sb } from "@/lib/supabase-browser";
import { fmtDate, fmtTime, money, lbp, type OfferKind } from "@/lib/config";
import { useLang, useT, useCur } from "@/lib/lang";
import { rotatingToken, secondsToNextSlot, icsFor, download, ticketImage } from "@/lib/wallet";

export type WalletTicket = {
  id: string; code: string; token: string; seat: string | null; state: string; created_at: string; valid_until: string | null; order_id: string | null; recipient?: { name?: string; phone?: string } | null;
  events: { id: string; slug: string; title: string; title_ar: string | null; starts_at: string; ends_at?: string | null; doors_at?: string | null; kind: string; refund_policy?: any; venues: { name: string; name_ar: string | null; city: string; city_ar: string | null } | null; organisers?: { whatsapp: string | null } | null } | null;
  tiers: { name: string; name_ar: string | null; kind: OfferKind; plan_months: number | null; note: string | null; face_price?: number } | null;
  orders: { meta: any; total: number; payment_method: string | null; addons?: any[]; refund_status?: string | null } | null;
};
const pick = (lang: string, row: any, key: string) => (lang === "ar" && row?.[`${key}_ar`]) || row?.[key] || "";
export const kindOf = (tk: WalletTicket): OfferKind => tk.tiers?.kind ?? (tk.seat && !tk.tiers ? "table" : "ticket");
export const isPast = (tk: WalletTicket) => { const e = tk.events; if (!e) return false; const end = e.kind === "event" ? new Date(e.starts_at).getTime() + 6 * 3600e3 : new Date(e.ends_at ?? e.starts_at).getTime() + 864e5; return end < Date.now(); };

function shareText(tk: WalletTicket, lang: string) {
  const e = tk.events;
  return `🎟 ${pick(lang, e, "title")}\n📅 ${e ? fmtDate(e.starts_at) : ""} ${e && e.kind === "event" ? fmtTime(e.starts_at) : ""}\n📍 ${pick(lang, e?.venues, "name")}, ${pick(lang, e?.venues, "city")}\n${pick(lang, tk.tiers, "name")}${tk.seat ? ` · ${tk.seat}` : ""}\n${tk.code}\n${typeof location !== "undefined" ? location.origin : ""}/t/${tk.code}`;
}

/** Live QR: a rotating WU2 token when the ticket's key is known (refreshes every 2 minutes), the static WU1 token otherwise. */
export function LiveQr({ tk, rotKey, size }: { tk: WalletTicket; rotKey?: string; size: number }) {
  const [value, setValue] = useState(tk.token);
  const [left, setLeft] = useState(secondsToNextSlot());
  useEffect(() => {
    if (!rotKey || tk.state !== "valid") { setValue(tk.token); return; }
    let alive = true, slot = -1;
    const mint = async () => { slot = Math.floor(Date.now() / 1000 / SLOT); const v = await rotatingToken(tk.id, rotKey); if (alive) setValue(v); };
    mint();
    const iv = setInterval(() => { setLeft(secondsToNextSlot()); if (Math.floor(Date.now() / 1000 / SLOT) !== slot) mint(); }, 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [rotKey, tk.id, tk.token, tk.state]);
  return (
    <div className="qr" style={{ position: "relative" }}>
      <QRCodeSVG value={value} size={size} level="M" />
      {rotKey && tk.state === "valid" && <div className="bar" style={{ marginTop: 6 }}><b style={{ width: `${Math.round((left / SLOT) * 100)}%` }} /></div>}
    </div>
  );
}
const SLOT = 120;

/** Ticket / day pass / item / booking card (brief §5.5): facet band, type eyebrow, title, dashed rule, live QR, status, actions. */
export function TicketCard({ tk, holder, compact, rotKey, onChange }: { tk: WalletTicket; holder: string; compact?: boolean; rotKey?: string; onChange?: () => void }) {
  const t = useT();
  const lang = useLang();
  const cur = useCur();
  const toast = useToast();
  const e = tk.events;
  const kind = kindOf(tk);
  const used = tk.state === "scanned";
  const meta = tk.orders?.meta ?? {};
  const [sheet, setSheet] = useState<"none" | "transfer" | "refund" | "more">("none");
  const [form, setForm] = useState({ name: "", phone: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const qrCanvas = useRef<HTMLDivElement>(null);
  const label = kind === "table" ? `${t("table")}${meta.party ? ` · ${meta.party}` : ""}${meta.time ? ` · ${meta.time}` : ""}${meta.package?.name ? ` · ${meta.package.name}` : ""}` : kind === "stay" ? `${meta.nights ?? 1} ${t("nights")}${meta.checkin ? ` · ${meta.checkin}` : ""}` : pick(lang, tk.tiers, "name");
  const status = used ? ["used", `✓ ${t(kind === "table" ? "holdReleased" : "used")}`]
    : tk.state === "reserved" ? ["hold", t("reserved")]
    : tk.state === "resale" ? ["hold", t("listedResale")]
    : tk.state === "sold_back" ? ["used", t("soldBack")]
    : tk.state === "transferred" ? ["used", t("transferredK")]
    : tk.state === "void" ? ["used", tk.orders?.refund_status === "refunded" ? t("refunded") : t("void")]
    : tk.state === "valid" ? ["ok", kind === "table" || kind === "stay" ? t("booked") : t("paid")] : ["used", tk.state];
  const wa = `https://wa.me/?text=${encodeURIComponent(shareText(tk, lang))}`;
  const past = isPast(tk);
  const canTransfer = tk.state === "valid" && !past && ["ticket", "daypass", "item"].includes(kind);
  const canSell = tk.state === "valid" && !past && ["ticket", "daypass", "item"].includes(kind) && Number(tk.orders?.total ?? 0) > 0;
  const protectedOrder = (tk.orders?.addons ?? []).some((a: any) => a.kind === "refund_protection");
  const canRefund = tk.state === "valid" && !past && !!tk.order_id && !tk.orders?.refund_status && Number(tk.orders?.total ?? 0) > 0;
  const orgWa = e?.organisers?.whatsapp ?? null;

  const call = async (body: any, okMsg: string) => {
    setBusy(true);
    const { data, error } = await sb().functions.invoke("wallet", { body });
    setBusy(false);
    const err = data?.error ?? (error ? (await (error as any)?.context?.json?.().catch(() => null))?.error ?? error.message : null);
    if (err) return toast(t(err === "policy" ? "refundPolicyNo" : err === "state" ? "notNow" : err === "recipient" ? "giftPhone" : "noResults"));
    toast(okMsg); setSheet("none"); onChange?.();
    return data;
  };
  const transfer = () => call({ action: "transfer", ticket_id: tk.id, name: form.name, phone: form.phone }, t("transferSent"));
  const sellBack = () => call({ action: "sell_back", ticket_id: tk.id }, t("listedResale"));
  const unlist = () => call({ action: "unlist", ticket_id: tk.id }, t("unlisted"));
  const refund = () => call({ action: "refund_request", order_id: tk.order_id, reason: form.reason }, t("refundSent"));
  const calendar = () => e && download(`${tk.code}.ics`, new Blob([icsFor({ title: pick(lang, e, "title"), start: e.doors_at ?? e.starts_at, end: e.kind === "event" ? null : e.ends_at, location: `${pick(lang, e.venues, "name")}, ${pick(lang, e.venues, "city")}`, url: `${location.origin}/t/${tk.code}`, code: tk.code })], { type: "text/calendar" }));
  const saveImage = async () => {
    const canvas = qrCanvas.current?.querySelector("canvas") ?? null;
    const blob = await ticketImage({ title: pick(lang, e, "title"), line1: e ? `${fmtDate(e.starts_at)}${e.kind === "event" ? `, ${fmtTime(e.starts_at)}` : ""}` : "", line2: `${pick(lang, e?.venues, "name")}, ${pick(lang, e?.venues, "city")} · ${label}`, code: tk.code, holder, qrCanvas: canvas });
    if (blob) { download(`${tk.code}.png`, blob); toast(t("imageSaved")); }
  };

  return (
    <div className="ticket" style={past || used ? { opacity: 0.85 } : undefined}>
      <div className="band"><Facet h={56} /></div>
      <div style={{ padding: "14px 16px" }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">{t(kind)}</div>
            <div className="title" style={{ fontSize: 18, marginTop: 4 }}>{pick(lang, e, "title")}</div>
          </div>
          <span className={`status ${status[0]}`} role="status">{status[1]}</span>
        </div>
        <div className="meta">{e ? (e.kind === "event" ? `${fmtDate(e.starts_at)}, ${fmtTime(e.starts_at)}` : pick(lang, e.venues, "city")) : ""} · {pick(lang, e?.venues, "name")}</div>
        <div className="dash" />
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <LiveQr tk={tk} rotKey={rotKey} size={compact ? 80 : 96} />
          <div ref={qrCanvas} hidden><QRCodeCanvas value={tk.token} size={520} level="M" includeMargin /></div>
          <div style={{ fontSize: 13, lineHeight: 1.7, minWidth: 0 }}>
            <div style={{ color: "var(--ink2)" }}>{label}</div>
            <div>{tk.recipient?.name && !holder ? tk.recipient.name : holder}</div>
            <div style={{ color: "var(--red-dark)", fontWeight: 600, letterSpacing: ".06em" }}>{tk.code}</div>
            <div className="small">
              {[meta.covered ? t("youAreMember") : tk.tiers?.note ? tk.tiers.note : kind === "item" ? t("pickup") : "", tk.orders?.total ? `${money(Number(tk.orders.total))}${cur === "LBP" ? ` ≈ ${lbp(Number(tk.orders.total))}` : ""}` : "", protectedOrder ? t("protected") : ""].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        {meta.gift?.name && (
          <div className="moment" style={{ marginTop: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>🎁 {t("giftedTo")} {meta.gift.name}</div>
              <div className="small" style={{ color: "var(--g1)" }}>{meta.gift.phone || "WhatsApp"}</div>
            </div>
          </div>
        )}
        <p className="small" style={{ margin: "10px 0 0" }}>{tk.state === "reserved" ? t("reservedNote") : tk.state === "resale" ? t("resaleNote") : rotKey && tk.state === "valid" ? t("liveQrNote") : t("showQr")}</p>
        {!compact && (
          <>
            <div className="grid2" style={{ marginTop: 12 }}>
              <a className="btn line" href={wa} target="_blank" rel="noopener">{t("sendWa")}</a>
              <button className="btn line" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/t/${tk.code}`); toast(t("linkCopied")); }}>{t("copyLink")}</button>
              {e && <Link href={`/story/${e.slug}`} className="btn line">⤴ {t("shareIg")}</Link>}
              <button className="btn line" onClick={() => setSheet(sheet === "more" ? "none" : "more")}>{t("more")} {sheet === "more" ? "▴" : "▾"}</button>
            </div>
            {sheet === "more" && (
              <div className="grid2" style={{ marginTop: 8 }}>
                <button className="btn line sm" onClick={saveImage}>{t("saveImage")}</button>
                <button className="btn line sm" onClick={calendar}>{t("addCalendar")}</button>
                {canTransfer && <button className="btn line sm" onClick={() => setSheet("transfer")}>{t("transfer")}</button>}
                {canSell && <button className="btn line sm" disabled={busy} onClick={sellBack}>{t("sellBack")}</button>}
                {tk.state === "resale" && <button className="btn line sm" disabled={busy} onClick={unlist}>{t("unlist")}</button>}
                {canRefund && <button className="btn line sm" onClick={() => setSheet("refund")}>{protectedOrder ? t("cancelProtected") : t("requestRefund")}</button>}
                {tk.orders?.refund_status && <span className="tag" style={{ alignSelf: "center" }}>{t("refundK")} · {t(tk.orders.refund_status)}</span>}
                {e && <Link href={`/squad/new?event=${e.id}`} className="btn line sm">👥 {t("squad")}</Link>}
                {orgWa && <a className="btn line sm" href={`https://wa.me/${orgWa.replace(/\D/g, "")}?text=${encodeURIComponent(`${pick(lang, e, "title")} · ${tk.code}`)}`} target="_blank" rel="noopener">{t("askVenue")}</a>}
              </div>
            )}
            {sheet === "transfer" && (
              <div className="gift" style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t("transferTitle")}</div>
                <div className="small">{t("transferNote")}</div>
                <input placeholder={t("giftTo")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input placeholder={t("giftPhone")} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <div className="grid2" style={{ marginTop: 8 }}><button className="btn red sm" disabled={busy || !form.name || form.phone.length < 6} onClick={transfer}>{t("transfer")}</button><button className="btn line sm" onClick={() => setSheet("none")}>{t("back")}</button></div>
              </div>
            )}
            {sheet === "refund" && (
              <div className="gift" style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{protectedOrder ? t("cancelProtected") : t("requestRefund")}</div>
                <div className="small">{protectedOrder ? t("refundProtectedNote") : t("refundPolicyNote")}</div>
                <input placeholder={t("reason")} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                <div className="grid2" style={{ marginTop: 8 }}><button className="btn red sm" disabled={busy} onClick={refund}>{t("send")}</button><button className="btn line sm" onClick={() => setSheet("none")}>{t("back")}</button></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Black member card for a pass: plan badge, name, code, valid-until, live QR, perks (brief §5.5). */
export function MemberCard({ tk, holder, rotKey }: { tk: WalletTicket; holder: string; rotKey?: string }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const e = tk.events;
  const plan = tk.tiers?.plan_months === 12 ? t("annual") : tk.tiers?.plan_months === 4 ? t("season") : t("monthly");
  return (
    <div className="member">
      <div className="row">
        <div>
          <div className="wm-top dim">{t("wm1")}</div>
          <div className="wm-main" style={{ fontSize: 20 }}>{t("member")}</div>
        </div>
        <span style={{ fontSize: 12, padding: "4px 9px", borderRadius: 6, background: "var(--g1)", color: "#fff", fontWeight: 600 }}>{plan}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 14 }}>{pick(lang, e, "title")}</div>
      <div className="dim" style={{ fontSize: 13 }}>{holder} · {tk.code}{tk.valid_until ? ` · ${t("validUntil")} ${fmtDate(tk.valid_until)}` : ""}</div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
        <LiveQr tk={{ ...tk, state: "valid" }} rotKey={rotKey} size={72} />
        <div className="dim" style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ color: "var(--g3)" }}>{t("checkInQr")}</div>
          <div>{t("passPerks")}</div>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 12 }}>
        {e && <Link href={`/?c=Beach`} className="btn sm" style={{ background: "#fff", color: "#000" }}>{t("planVisit")}</Link>}
        <a className="btn sm" style={{ border: "1px solid #444", color: "#fff" }} href={`https://wa.me/?text=${encodeURIComponent(shareText(tk, lang))}`} target="_blank" rel="noopener" onClick={() => toast(t("waSent"))}>{t("sendWa")}</a>
      </div>
    </div>
  );
}

export type Coupon = { event_id: string; deal_id: string; code: string; redeemed_at: string | null; events: { slug: string; title: string; title_ar: string | null; deals: any[] } | null };
/** Dashed coupon with Redeem. */
export function CouponCard({ c, onRedeem }: { c: Coupon; onRedeem: (c: Coupon) => void }) {
  const t = useT();
  const lang = useLang();
  const deal = (c.events?.deals ?? []).find((d: any) => d.id === c.deal_id);
  return (
    <div className="ticket coupon">
      <div style={{ padding: "12px 16px" }}>
        <div className="row">
          <div>
            <div className="small">{t("deal")} · {pick(lang, c.events, "title")}</div>
            <div className="title" style={{ fontSize: 15, marginTop: 2 }}>{deal ? pick(lang, deal, "name") : c.deal_id}</div>
            <div className="small" style={{ color: "var(--red-dark)", fontWeight: 600, marginTop: 2 }}>{c.code}</div>
          </div>
          {c.redeemed_at ? <span className="status used">✓ {t("redeemed")}</span> : <button className="btn green sm" onClick={() => onRedeem(c)}>{t("redeem")}</button>}
        </div>
      </div>
    </div>
  );
}
