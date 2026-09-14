"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

/** Email + password sign-in, or WhatsApp OTP (phone OTP delivered by the wa-otp-hook edge function). */
export default function LoginForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("+961 ");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad stack">
      <div className="seg">
        <button className={mode === "email" ? "on" : ""} onClick={() => setMode("email")}>{t("email")}</button>
        <button className={mode === "phone" ? "on" : ""} onClick={() => setMode("phone")}>WhatsApp</button>
      </div>
      {mode === "phone" ? (
        sent ? (
          <>
            <p className="note" style={{ margin: 0 }}>{t("enterCode")} <b>{phone}</b></p>
            <div className="field">
              <input inputMode="numeric" maxLength={6} aria-label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em" }} />
            </div>
            <button
              className="btn green"
              disabled={busy || code.length < 6}
              onClick={() =>
                run(async () => {
                  const { error } = await sb().auth.verifyOtp({ phone: phone.replace(/\s/g, ""), token: code, type: "sms" });
                  if (error) throw error;
                  onDone();
                })
              }
            >
              {t("verify")}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <span className="label">{t("waNumber")}</span>
              <input inputMode="tel" aria-label="WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 3 000 000" />
            </div>
            <button
              className="btn wa"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { error } = await sb().auth.signInWithOtp({ phone: phone.replace(/\s/g, "") });
                  if (error) throw new Error(error.message.includes("not enabled") || error.message.includes("Unsupported") ? t("waOff") : error.message);
                  setSent(true);
                })
              }
            >
              {t("sendCode")}
            </button>
          </>
        )
      ) : (
        <>
          <div className="field">
            <span className="label">{t("email")}</span>
            <input type="email" autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">{t("password")}</span>
            <input type="password" autoComplete="current-password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button
            className="btn green"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { error } = await sb().auth.signInWithPassword({ email, password });
                if (error) throw error;
                onDone();
              })
            }
          >
            {t("cont")}
          </button>
        </>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
