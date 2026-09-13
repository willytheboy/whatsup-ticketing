// Supabase Auth "Send SMS" hook -> delivers the OTP on WhatsApp instead of SMS.
// Auth -> Hooks -> Send SMS: point at this function; set SEND_SMS_HOOK_SECRET. Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_OTP_TEMPLATE.
// Without WHATSAPP_TOKEN it runs in sandbox and logs the code to message_log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "npm:standardwebhooks@1";
import { admin, json } from "./lib.ts";

const HOOK_SECRET = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const WA_TEMPLATE = Deno.env.get("WHATSAPP_OTP_TEMPLATE") ?? "otp_code";

Deno.serve(async (req) => {
  const payload = await req.text();
  let body: any;
  try {
    if (HOOK_SECRET) {
      const wh = new Webhook(HOOK_SECRET.replace("v1,whsec_", ""));
      body = wh.verify(payload, Object.fromEntries(req.headers));
    } else body = JSON.parse(payload);
  } catch { return json({ error: { http_code: 401, message: "bad_signature" } }, 401); }

  const phone: string = body?.user?.phone;
  const otp: string = body?.sms?.otp;
  if (!phone || !otp) return json({ error: { http_code: 400, message: "missing phone/otp" } }, 400);
  const db = admin();
  const to = phone.replace(/^\+/, "");

  if (WA_TOKEN && WA_PHONE_ID) {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: WA_TEMPLATE, language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: otp }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] }] } }),
    });
    const res = await r.json().catch(() => ({}));
    await db.from("message_log").insert({ channel: "whatsapp", template: "otp", payload: { to, ok: r.ok }, status: r.ok ? "sent" : "failed", provider_ref: res?.messages?.[0]?.id ?? null });
    if (!r.ok) return json({ error: { http_code: 500, message: "whatsapp_send_failed" } }, 500);
    return json({});
  }
  await db.from("message_log").insert({ channel: "whatsapp", template: "otp", payload: { to, otp, sandbox: true }, status: "sandbox" });
  return json({});
});
