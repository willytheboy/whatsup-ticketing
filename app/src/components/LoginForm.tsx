"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";

/** Email + password sign-in, account creation and password reset, or WhatsApp OTP (phone OTP delivered by the wa-otp-hook edge function).
    `returnTo` is where email links (confirmation, reset) bring the person back to; it defaults to the current page. */
export default function LoginForm({ onDone, returnTo }: { onDone: () => void; returnTo?: string }) {
  const t = useT();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("+961 ");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [name, setName] = useState("");
  const [info, setInfo] = useState("");
  const [recovery, setRecovery] = useState(false);

  // Back from a reset link (/login?reset=1 with a recovery session): ask for the new password.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("reset")) return;
    sb().auth.getSession().then(({ data }) => { if (data.session) setRecovery(true); });
    const { data: sub } = sb().auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const back = () => `${location.origin}${returnTo ?? `${location.pathname}${location.search.replace(/[?&]reset=1/, "")}`}`;
  /** Supabase messages are English and technical; the common ones get a friendly line in the person's language. */
  const friendly = (m: string) =>
    /invalid login credentials/i.test(m) ? t("badLogin") : /already registered|already been registered/i.test(m) ? t("alreadyUser") : /email not confirmed/i.test(m) ? t("confirmFirst") : m;
  const switchTo = (m: "signin" | "signup" | "forgot") => { setEmailMode(m); setErr(""); setInfo(""); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e: any) {
      setErr(friendly(e?.message ?? "Something went wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad stack">
      {!recovery && (
        <div className="seg">
          <button className={mode === "email" ? "on" : ""} onClick={() => setMode("email")}>{t("email")}</button>
          <button className={mode === "phone" ? "on" : ""} onClick={() => setMode("phone")}>WhatsApp</button>
        </div>
      )}
      {mode === "phone" && !recovery ? (
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
      ) : recovery ? (
        <>
          <p className="note" style={{ margin: 0 }}>{t("newPwHint")}</p>
          <div className="field">
            <span className="label">{t("newPassword")}</span>
            <input type="password" autoComplete="new-password" aria-label={t("newPassword")} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button
            className="btn green"
            disabled={busy || password.length < 6}
            onClick={() =>
              run(async () => {
                const { error } = await sb().auth.updateUser({ password });
                if (error) throw error;
                setRecovery(false);
                onDone();
              })
            }
          >
            {t("savePw")}
          </button>
        </>
      ) : (
        <>
          {emailMode === "signup" && (
            <div className="field">
              <span className="label">{t("yourName")}</span>
              <input autoComplete="name" aria-label={t("yourName")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <span className="label">{t("email")}</span>
            <input type="email" autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {emailMode !== "forgot" && (
            <div className="field">
              <span className="label">{t("password")}</span>
              <input type="password" autoComplete={emailMode === "signup" ? "new-password" : "current-password"} aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {emailMode === "signup" && <span className="small">{t("pwRule")}</span>}
            </div>
          )}
          {info ? (
            <p className="note" role="status" style={{ margin: 0 }}>{info}</p>
          ) : (
            <button
              className="btn green"
              disabled={busy || !email.includes("@") || (emailMode === "signup" && (password.length < 6 || !name.trim()))}
              onClick={() =>
                run(async () => {
                  const addr = email.trim();
                  if (emailMode === "forgot") {
                    const { error } = await sb().auth.resetPasswordForEmail(addr, { redirectTo: `${location.origin}/login?reset=1` });
                    if (error) throw error;
                    setInfo(`${t("resetSent")} ${addr}`);
                    return;
                  }
                  if (emailMode === "signup") {
                    const { data, error } = await sb().auth.signUp({ email: addr, password, options: { data: { name: name.trim() }, emailRedirectTo: back() } });
                    if (error) throw error;
                    // an existing address comes back with no identities (Supabase hides that the account exists)
                    if (data.user && !data.user.identities?.length) throw new Error(t("alreadyUser"));
                    if (data.session) return onDone();
                    setInfo(`${t("confirmSent")} ${addr}`);
                    return;
                  }
                  const { error } = await sb().auth.signInWithPassword({ email: addr, password });
                  if (error) throw error;
                  onDone();
                })
              }
            >
              {emailMode === "signup" ? t("createAccount") : emailMode === "forgot" ? t("sendReset") : t("cont")}
            </button>
          )}
          <div className="row between small" style={{ flexWrap: "wrap", gap: 8 }}>
            {emailMode === "signin" ? (
              <>
                <button type="button" className="link" onClick={() => switchTo("signup")}>{t("newHere")} <b>{t("createAccount")}</b></button>
                <button type="button" className="link" onClick={() => switchTo("forgot")}>{t("forgotPw")}</button>
              </>
            ) : (
              <button type="button" className="link" onClick={() => switchTo("signin")}>{t("haveAccount")} <b>{t("signIn")}</b></button>
            )}
          </div>
        </>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
