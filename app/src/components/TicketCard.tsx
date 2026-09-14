"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Facet } from "./Band";
import { useToast } from "./Toast";
import { fmtDate, fmtTime, money, type OfferKind } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

export type WalletTicket = {
  code: string; token: string; seat: string | null; state: string; created_at: string; valid_until: string | null;
  events: { id: string; slug: string; title: string; title_ar: string | null; starts_at: string; kind: string; venues: { name: string; name_ar: string | null; city: string; city_ar: string | null } | null } | null;
  tiers: { name: string; name_ar: string | null; kind: OfferKind; plan_months: number | null; note: string | null } | null;
  orders: { meta: any; total: number; payment_method: string | null } | null;
};
const pick = (lang: string, row: any, key: string) => (lang === "ar" && row?.[`${key}_ar`]) || row?.[key] || "";
export const kindOf = (tk: WalletTicket): OfferKind => tk.tiers?.kind ?? (tk.seat && !tk.tiers ? "table" : "ticket");

function shareText(tk: WalletTicket, lang: string) {
  const e = tk.events;
  return `🎟 ${pick(lang, e, "title")}\n📅 ${e ? fmtDate(e.starts_at) : ""} ${e && e.kind === "event" ? fmtTime(e.starts_at) : ""}\n📍 ${pick(lang, e?.venues, "name")}, ${pick(lang, e?.venues, "city")}\n${pick(lang, tk.tiers, "name")}${tk.seat ? ` · ${tk.seat}` : ""}\n${tk.code}\n${typeof location !== "undefined" ? location.origin : ""}/t/${tk.code}`;
}

/** Ticket / day pass / item / booking card (brief §5.5): facet band, type eyebrow, title, dashed rule, QR, status, actions. */
export function TicketCard({ tk, holder, compact }: { tk: WalletTicket; holder: string; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const e = tk.events;
  const kind = kindOf(tk);
  const used = tk.state === "scanned";
  const meta = tk.orders?.meta ?? {};
  const label = kind === "table" ? `${t("table")}${meta.party ? ` · ${meta.party}` : ""}${meta.time ? ` · ${meta.time}` : ""}` : kind === "stay" ? `${meta.nights ?? 1} ${t("nights")}${meta.checkin ? ` · ${meta.checkin}` : ""}` : pick(lang, tk.tiers, "name");
  const status = used ? ["used", `✓ ${t(kind === "table" ? "holdReleased" : "used")}`] : tk.state === "reserved" ? ["hold", t("reserved")] : tk.state === "valid" ? ["ok", kind === "table" || kind === "stay" ? t("booked") : t("paid")] : ["used", tk.state];
  const wa = `https://wa.me/?text=${encodeURIComponent(shareText(tk, lang))}`;
  return (
    <div className="ticket">
      <div className="band"><Facet h={56} /></div>
      <div style={{ padding: "14px 16px" }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">{t(kind)}</div>
            <div className="title" style={{ fontSize: 18, marginTop: 4 }}>{pick(lang, e, "title")}</div>
          </div>
          <span className={`status ${status[0]}`}>{status[1]}</span>
        </div>
        <div className="meta">{e ? (e.kind === "event" ? `${fmtDate(e.starts_at)}, ${fmtTime(e.starts_at)}` : pick(lang, e.venues, "city")) : ""} · {pick(lang, e?.venues, "name")}</div>
        <div className="dash" />
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div className="qr"><QRCodeSVG value={tk.token} size={compact ? 80 : 96} level="M" /></div>
          <div style={{ fontSize: 13, lineHeight: 1.7, minWidth: 0 }}>
            <div style={{ color: "var(--ink2)" }}>{label}</div>
            <div>{holder}</div>
            <div style={{ color: "var(--red-dark)", fontWeight: 600, letterSpacing: ".06em" }}>{tk.code}</div>
            <div className="small">
              {[meta.covered ? t("youAreMember") : tk.tiers?.note ? tk.tiers.note : kind === "item" ? t("pickup") : "", tk.orders?.total ? money(Number(tk.orders.total)) : ""].filter(Boolean).join(" · ")}
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
        <p className="small" style={{ margin: "10px 0 0" }}>{tk.state === "reserved" ? t("reservedNote") : t("showQr")}</p>
        {!compact && (
          <div className="grid2" style={{ marginTop: 12 }}>
            <a className="btn line" href={wa} target="_blank" rel="noopener">{t("sendWa")}</a>
            <button className="btn line" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/t/${tk.code}`); toast(t("linkCopied")); }}>{t("copyLink")}</button>
            {e && <Link href={`/story/${e.slug}`} className="btn line" style={{ gridColumn: "span 2" }}>⤴ {t("shareIg")}</Link>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Black member card for a pass: plan badge, name, code, valid-until, QR, perks (brief §5.5). */
export function MemberCard({ tk, holder }: { tk: WalletTicket; holder: string }) {
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
        <div className="qr"><QRCodeSVG value={tk.token} size={72} level="M" /></div>
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
