import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, json, cors, APP_URL } from "./lib.ts";

/** Messaging worker (brief §5.6, §7): drains message_log and delivers on WhatsApp (Meta Cloud API) and email (Resend).
 *  Called by pg_cron every 5 minutes through app_settings.notify_url with X-Notify-Secret = app_settings.notify_secret,
 *  or by hand: POST {drain:true} · POST {test:true, to:"+961…", lang:"ar"} sends a test message.
 *  Without WHATSAPP_TOKEN / RESEND_API_KEY it runs in sandbox: messages are rendered and marked "sandbox" so they can be read in the back office.
 *  Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEXT_MODE (1 = free-form text instead of approved templates), WA_TPL_<template> (template name overrides),
 *       RESEND_API_KEY, EMAIL_FROM, NOTIFY_SECRET
 */
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN"); const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const WA_TEXT_MODE = Deno.env.get("WHATSAPP_TEXT_MODE") === "1";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY"); const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "WhatsUp <tickets@whatsuplebanon.com>";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";

const when = (iso?: string, lang = "en") => iso ? new Date(iso).toLocaleString(lang === "ar" ? "ar-LB" : "en-GB", { timeZone: "Asia/Beirut", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2).replace(/\.00$/, "")}`;

/** Copy for every template, EN and Lebanese Arabic. Returns {text, params} — params are the ordered variables of the approved WhatsApp template. */
export function render(template: string, p: any, lang: string): { text: string; params: string[]; subject: string } {
  const ar = lang === "ar";
  const codes = Array.isArray(p?.tickets) ? p.tickets.join(", ") : "";
  const walletUrl = `${APP_URL}/wallet`;
  switch (template) {
    case "ticket_delivery": return ar
      ? { subject: `تذاكرك · ${p.event ?? ""}`, params: [p.event ?? "", codes, walletUrl], text: `🎟️ جهزت تذاكرك لـ ${p.event ?? ""}.\nالرمز: ${codes}\nافتحها من المحفظة: ${walletUrl}${p.gift ? `\n🎁 هدية لـ ${p.gift.name ?? ""}` : ""}` }
      : { subject: `Your tickets · ${p.event ?? ""}`, params: [p.event ?? "", codes, walletUrl], text: `🎟️ Your tickets for ${p.event ?? ""} are ready.\nCode: ${codes}\nOpen them in your wallet: ${walletUrl}${p.gift ? `\n🎁 A gift for ${p.gift.name ?? ""}` : ""}` };
    case "reservation": return ar
      ? { subject: `محجوز · ${p.event ?? ""}`, params: [p.event ?? "", codes, money(p.total)], text: `✅ محجوز! ${p.event ?? ""}\nالرمز: ${codes}\nادفع ${money(p.total)} عالباب وبيتفعّل الـ QR.` }
      : { subject: `Reserved · ${p.event ?? ""}`, params: [p.event ?? "", codes, money(p.total)], text: `✅ Reserved! ${p.event ?? ""}\nCode: ${codes}\nPay ${money(p.total)} at the door and your QR goes live.` };
    case "reminder_24h": case "reminder_2h": { const h = template === "reminder_24h" ? 24 : 2; return ar
      ? { subject: `بكرا · ${p.event ?? ""}`, params: [p.event ?? "", when(p.starts_at, "ar"), p.venue ?? ""], text: `⏰ ${h === 24 ? "بكرا" : "بعد ساعتين"}: ${p.event ?? ""} · ${when(p.starts_at, "ar")}${p.venue ? ` · ${p.venue}` : ""}\nتذكرتك بالمحفظة: ${walletUrl}` }
      : { subject: `${h === 24 ? "Tomorrow" : "In 2 hours"} · ${p.event ?? ""}`, params: [p.event ?? "", when(p.starts_at), p.venue ?? ""], text: `⏰ ${h === 24 ? "Tomorrow" : "In 2 hours"}: ${p.event ?? ""} · ${when(p.starts_at)}${p.venue ? ` · ${p.venue}` : ""}\nYour ticket is in your wallet: ${walletUrl}` }; }
    case "weekly_digest": { const picks = (p.picks ?? []).map((x: any) => `• ${x.title} — ${when(x.starts_at, lang)} ${APP_URL}/e/${x.slug}`).join("\n"); return ar
      ? { subject: "شو في هالأسبوع", params: [picks], text: `🇱🇧 شو في هالأسبوع:\n${picks || "—"}` }
      : { subject: "What's up this week", params: [picks], text: `🇱🇧 What's up this week:\n${picks || "—"}` }; }
    case "waitlist": return ar
      ? { subject: `فتح مكان · ${p.event ?? ""}`, params: [p.event ?? "", p.tier ?? "", `${APP_URL}/e/${p.slug}`], text: `🔥 فتح مكان بـ ${p.event ?? ""} (${p.tier ?? ""}). بسرعة: ${APP_URL}/e/${p.slug}` }
      : { subject: `A spot opened · ${p.event ?? ""}`, params: [p.event ?? "", p.tier ?? "", `${APP_URL}/e/${p.slug}`], text: `🔥 A spot opened for ${p.event ?? ""} (${p.tier ?? ""}). Be quick: ${APP_URL}/e/${p.slug}` };
    case "transfer": return ar
      ? { subject: `تذكرة إلك · ${p.event ?? ""}`, params: [p.from ?? "صاحبك", p.event ?? "", p.link ?? walletUrl], text: `🎟️ ${p.from ?? "صاحبك"} بعتلك تذكرة لـ ${p.event ?? ""} (${when(p.starts_at, "ar")}).\nافتحها هون: ${p.link ?? walletUrl}${p.claim_code ? `\nرمز الاستلام: ${p.claim_code}` : ""}` }
      : { subject: `A ticket for you · ${p.event ?? ""}`, params: [p.from ?? "A friend", p.event ?? "", p.link ?? walletUrl], text: `🎟️ ${p.from ?? "A friend"} sent you a ticket for ${p.event ?? ""} (${when(p.starts_at)}).\nOpen it here: ${p.link ?? walletUrl}${p.claim_code ? `\nClaim code: ${p.claim_code}` : ""}` };
    case "sold_back": return ar
      ? { subject: "انباعت تذكرتك", params: [p.event ?? "", money(p.amount)], text: `💸 انباعت تذكرتك لـ ${p.event ?? ""}. ${money(p.amount)} رصيد بحسابك للحجز الجاي.` }
      : { subject: "Your ticket sold", params: [p.event ?? "", money(p.amount)], text: `💸 Your ticket for ${p.event ?? ""} sold. ${money(p.amount)} is now credit on your account for your next booking.` };
    case "referral_credit": return ar
      ? { subject: "رصيد إلك", params: [money(p.amount)], text: `🙌 صاحبك حجز بكودك. ${money(p.amount)} رصيد بحسابك.` }
      : { subject: "Credit for you", params: [money(p.amount)], text: `🙌 A friend booked with your code. ${money(p.amount)} of credit is on your account.` };
    case "refund_requested": return ar
      ? { subject: "طلب استرجاع", params: [p.event ?? "", money(p.total)], text: `↩️ وصلنا طلب الاسترجاع لـ ${p.event ?? ""} (${money(p.total)}).${p.protected ? " مغطّى بحماية الاسترجاع — بيرجع خلال ٥ أيام عمل." : " المنظّم بيرد خلال ٤٨ ساعة."}` }
      : { subject: "Refund request received", params: [p.event ?? "", money(p.total)], text: `↩️ We got your refund request for ${p.event ?? ""} (${money(p.total)}).${p.protected ? " Covered by refund protection — it lands within 5 working days." : " The organiser answers within 48 hours."}` };
    case "refund_requested_org": return { subject: `Refund request · ${p.event ?? ""}`, params: [p.event ?? "", money(p.total), p.reason ?? ""], text: `↩️ Refund request for ${p.event ?? ""} · ${money(p.total)}\nReason: ${p.reason || "—"}\nDecide in your dashboard: ${APP_URL}/org/refunds` };
    case "refund": return ar
      ? { subject: "تم الاسترجاع", params: [money(p.total)], text: `✅ رجعنالك ${money(p.total)}${p.method === "credit" ? " كرصيد بحسابك" : " على طريقة الدفع"}.` }
      : { subject: "Refunded", params: [money(p.total)], text: `✅ ${money(p.total)} has been refunded${p.method === "credit" ? " as credit on your account" : " to your payment method"}.` };
    case "promoter_sale": return { subject: "You made a sale", params: [p.event ?? "", money(p.commission)], text: `🎉 A sale through your link for ${p.event ?? ""}. Commission: ${money(p.commission)}.` };
    case "otp": return { subject: "Your code", params: [p.otp ?? ""], text: `Your WhatsUp code: ${p.otp ?? ""}` };
    default: return { subject: template, params: [], text: `${template}: ${JSON.stringify(p)}` };
  }
}

async function sendWhatsApp(to: string, template: string, lang: string, r: { text: string; params: string[] }) {
  const phone = to.replace(/^\+/, "").replace(/\D/g, "");
  const body = WA_TEXT_MODE
    ? { messaging_product: "whatsapp", to: phone, type: "text", text: { body: r.text, preview_url: true } }
    : { messaging_product: "whatsapp", to: phone, type: "template", template: { name: Deno.env.get(`WA_TPL_${template.toUpperCase()}`) ?? `wu_${template}`, language: { code: lang === "ar" ? "ar" : "en" }, components: r.params.length ? [{ type: "body", parameters: r.params.map((t) => ({ type: "text", text: String(t).slice(0, 1000) || "-" })) }] : [] } };
  const res = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, ref: j?.messages?.[0]?.id ?? null, error: j?.error?.message ?? null };
}
async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, ref: j?.id ?? null, error: j?.message ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const auth = req.headers.get("authorization") ?? "";
  const secretOk = NOTIFY_SECRET && req.headers.get("x-notify-secret") === NOTIFY_SECRET;
  const serviceOk = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!secretOk && !serviceOk) return json({ error: "forbidden" }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();

  if (b.test) {
    const r = render(b.template ?? "ticket_delivery", b.payload ?? { event: "Test event", tickets: ["WU-TEST"], total: 10 }, b.lang ?? "en");
    if (WA_TOKEN && WA_PHONE_ID && b.to) return json({ sent: await sendWhatsApp(b.to, b.template ?? "ticket_delivery", b.lang ?? "en", r), text: r.text });
    return json({ sandbox: true, text: r.text, params: r.params });
  }

  const { data: rows } = await db.from("message_log").select("id,user_id,channel,template,payload").eq("status", "queued").order("created_at").limit(Number(b.limit ?? 100));
  let sent = 0, sandbox = 0, failed = 0, emails = 0;
  for (const m of rows ?? []) {
    const p = m.payload ?? {};
    const { data: prof } = m.user_id ? await db.from("profiles").select("phone,email,lang,prefs").eq("id", m.user_id).maybeSingle() : { data: null };
    const lang = p.lang ?? prof?.lang ?? "en";
    const to = p.to ?? prof?.phone ?? null;
    const prefs = prof?.prefs ?? {};
    const r = render(m.template, p, lang);
    const reminder = ["reminder_24h", "reminder_2h", "weekly_digest"].includes(m.template);
    const always = m.template === "otp" || m.template === "transfer" || m.template.startsWith("refund");
    const wantsWa = always || (reminder ? (prefs.wa_reminders ?? true) : (prefs.wa_tickets ?? true));
    let status = "sandbox", ref: string | null = null, err: string | null = null;
    if (to && wantsWa && WA_TOKEN && WA_PHONE_ID) {
      const res = await sendWhatsApp(to, m.template, lang, r);
      status = res.ok ? "sent" : "failed"; ref = res.ref; err = res.error; res.ok ? sent++ : failed++;
    } else if (!to) { status = "skipped"; err = "no_phone"; }
    else sandbox++;
    if (RESEND_KEY && prof?.email && (prefs.email_copies || !to) && ["ticket_delivery", "reservation", "refund", "refund_requested", "transfer"].includes(m.template)) {
      const e = await sendEmail(prof.email, r.subject, r.text); if (e.ok) emails++;
    }
    await db.from("message_log").update({ status, provider_ref: ref, payload: { ...p, rendered: r.text, ...(err ? { error: err } : {}) } }).eq("id", m.id);
  }
  return json({ drained: (rows ?? []).length, sent, sandbox, failed, emails });
});
