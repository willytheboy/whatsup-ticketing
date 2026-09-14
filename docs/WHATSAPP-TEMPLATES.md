# WhatsApp templates

WhatsUp delivers tickets, reminders and receipts on WhatsApp through the Meta Cloud API. Business-initiated messages must use templates approved in Meta Business Manager; this file lists every template the `notify` edge function sends, with the exact body and variables to submit, in English and Lebanese Arabic. Approve each one in both languages under the same name (Meta treats language as a variant of one template).

Naming: the function sends `wu_<template>` unless `WA_TPL_<TEMPLATE>` is set in the function's secrets (for example `WA_TPL_TICKET_DELIVERY=wu_ticket_delivery_v2`). Category: **Utility** for everything except `weekly_digest`, which is **Marketing** and only goes to people with `wa_reminders` on. Until the templates are approved, set `WHATSAPP_TEXT_MODE=1` to send the same copy as free-form text (works only inside the 24-hour customer-service window — fine for testing with numbers that messaged the business first).

| Template | Variables (in order) | English body | Arabic body |
| --- | --- | --- | --- |
| `wu_otp` (auth hook) | code | Your WhatsUp code: {{1}} | رمز WhatsUp تبعك: {{1}} |
| `wu_ticket_delivery` | event, codes, wallet URL | 🎟️ Your tickets for {{1}} are ready. Code: {{2}}. Open them in your wallet: {{3}} | 🎟️ جهزت تذاكرك لـ {{1}}. الرمز: {{2}}. افتحها من المحفظة: {{3}} |
| `wu_reservation` | event, codes, amount | ✅ Reserved! {{1}}. Code: {{2}}. Pay {{3}} at the door and your QR goes live. | ✅ محجوز! {{1}}. الرمز: {{2}}. ادفع {{3}} عالباب وبيتفعّل الـ QR. |
| `wu_reminder_24h` | event, when, venue | ⏰ Tomorrow: {{1}} · {{2}} · {{3}}. Your ticket is in your wallet. | ⏰ بكرا: {{1}} · {{2}} · {{3}}. تذكرتك بالمحفظة. |
| `wu_reminder_2h` | event, when, venue | ⏰ In 2 hours: {{1}} · {{2}} · {{3}}. Your ticket is in your wallet. | ⏰ بعد ساعتين: {{1}} · {{2}} · {{3}}. تذكرتك بالمحفظة. |
| `wu_weekly_digest` (marketing) | picks | 🇱🇧 What's up this week: {{1}} | 🇱🇧 شو في هالأسبوع: {{1}} |
| `wu_waitlist` | event, tier, URL | 🔥 A spot opened for {{1}} ({{2}}). Be quick: {{3}} | 🔥 فتح مكان بـ {{1}} ({{2}}). بسرعة: {{3}} |
| `wu_transfer` | sender, event, link | 🎟️ {{1}} sent you a ticket for {{2}}. Open it here: {{3}} | 🎟️ {{1}} بعتلك تذكرة لـ {{2}}. افتحها هون: {{3}} |
| `wu_sold_back` | event, amount | 💸 Your ticket for {{1}} sold. {{2}} is now credit on your account. | 💸 انباعت تذكرتك لـ {{1}}. {{2}} رصيد بحسابك. |
| `wu_referral_credit` | amount | 🙌 A friend booked with your code. {{1}} of credit is on your account. | 🙌 صاحبك حجز بكودك. {{1}} رصيد بحسابك. |
| `wu_refund_requested` | event, amount | ↩️ We got your refund request for {{1}} ({{2}}). The organiser answers within 48 hours. | ↩️ وصلنا طلب الاسترجاع لـ {{1}} ({{2}}). المنظّم بيرد خلال ٤٨ ساعة. |
| `wu_refund_requested_org` | event, amount, reason | ↩️ Refund request for {{1}} · {{2}}. Reason: {{3}}. Decide in your dashboard. | — (organisers get English) |
| `wu_refund` | amount | ✅ {{1}} has been refunded. | ✅ رجعنالك {{1}}. |
| `wu_promoter_sale` | event, commission | 🎉 A sale through your link for {{1}}. Commission: {{2}}. | — |
| `wu_statement` (v0.8) | partner, period, balance | 📄 {{1}} statement · {{2}}. Balance {{3}}. Details in your dashboard. | 📄 كشف حساب {{1}} · {{2}}. الرصيد {{3}}. التفاصيل بلوحتك. |

Buttons: `wu_ticket_delivery`, `wu_transfer` and `wu_waitlist` benefit from a URL button pointing at the wallet or listing (`https://whatsup-ticketing-app.vercel.app/{{1}}`); the function passes the URL as a body variable when no button is configured, so the template works either way.

## Inbound (v0.8): the concierge on the business number

Point the Meta webhook at `https://<ref>.supabase.co/functions/v1/wa-inbound` (verify token `WHATSAPP_VERIFY_TOKEN`, app secret `WHATSAPP_APP_SECRET`; subscribe to `messages`). People who write to the number get catalogue answers and one-tap checkout links (`/e/<slug>?tier=…&qty=…&via=wa`) — replies are free-form text inside the 24-hour window, so no template is needed. "Talk to a person" pauses the bot until Back office → WhatsApp releases it. Inbound messages are logged as `whatsapp_in`, replies as template `wa_reply`. With `ANTHROPIC_API_KEY` on the function the answers are phrased by Claude; without it, by rules.

## Sending rules

The queue is `message_log` (status `queued`). The `notify` function drains it every five minutes (pg_cron → `drain_messages()` → `POST /functions/v1/notify` with `X-Notify-Secret`). A row is skipped when the profile has no phone (`skipped`), rendered but not sent when WhatsApp is not connected (`sandbox`), or sent (`sent`, with the Meta message id in `provider_ref`). Preferences: `wa_tickets` gates delivery messages, `wa_reminders` gates reminders and the digest, `email_copies` adds an email through Resend when the buyer has an address. OTP, transfers and refunds always send.

## Secrets to set on the `notify` and `wa-otp-hook` functions

`WHATSAPP_TOKEN` (permanent system-user token), `WHATSAPP_PHONE_ID`, `WHATSAPP_OTP_TEMPLATE` (default `otp_code`), optional `WA_TPL_*` overrides, `WHATSAPP_TEXT_MODE=1` while templates are pending, `RESEND_API_KEY` and `EMAIL_FROM` for email copies, `NOTIFY_SECRET` (must equal `app_settings.notify_secret`). On `wa-inbound` additionally `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, optional `ANTHROPIC_API_KEY`, and `TENANT` (slug the number belongs to). Partner statements (`statement`) go to the partner's phone and email on the partner record, not to a user.
