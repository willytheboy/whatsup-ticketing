"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { useLang, useT, setLang, setCity } from "@/lib/lang";
import { useRoles } from "@/lib/roles";
import { BACKOFFICE_URL, FX_RATE, IG_HANDLE } from "@/lib/config";

type Profile = { name: string | null; phone: string | null; email: string | null; referral_code: string | null; credit: number; prefs: any; currency: string };

/** Profile (brief §5.12): name and WhatsApp line, referral card, settings, venue entry points (role-gated), sign out. */
export default function ProfilePage() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const roles = useRoles();
  const [p, setP] = useState<Profile | null>(null);
  const [city, setCityState] = useState("");
  const [orgs, setOrgs] = useState<{ id: string; name: string; plan: string }[]>([]);

  useEffect(() => {
    setCityState(decodeURIComponent((document.cookie.match(/(?:^|; )city=([^;]*)/) ?? [])[1] ?? ""));
    sb().auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const [{ data: pr }, { data: o }] = await Promise.all([
        sb().from("profiles").select("name,phone,email,referral_code,credit,prefs,currency").eq("id", data.user.id).maybeSingle(),
        sb().from("v_my_organisers").select("id,name,plan"),
      ]);
      setP((pr as Profile) ?? { name: data.user.email ?? "", phone: null, email: data.user.email ?? null, referral_code: null, credit: 0, prefs: {}, currency: "USD" });
      setOrgs((o ?? []) as any);
    });
  }, []);

  const toggleWa = async () => {
    if (!p || !roles.user) return;
    const prefs = { ...(p.prefs ?? {}), wa_reminders: !(p.prefs?.wa_reminders ?? true) };
    await sb().from("profiles").update({ prefs }).eq("id", roles.user.id);
    setP({ ...p, prefs });
  };
  const shareCode = () => {
    const url = `${location.origin}/?ref=${p?.referral_code ?? ""}`;
    if (navigator.share) navigator.share({ text: `${t("refSub")} ${url}` }).catch(() => {}); else navigator.clipboard?.writeText(url);
    toast(t("copied"));
  };
  const initial = (p?.name || p?.email || "?")[0].toUpperCase();

  return (
    <>
      <TopBar eyebrow={t("profile")} avatar={false} right={roles.user ? <div className="av" style={{ width: 48, height: 48, fontSize: 18 }}>{initial}</div> : undefined} />
      <main style={{ paddingTop: 0 }}>
        {roles.loaded && !roles.user && (
          <div className="card pad stack">
            <div style={{ fontSize: 18, fontWeight: 600 }}>{t("guest")}</div>
            <p className="meta" style={{ margin: 0 }}>{t("signInFirst")}</p>
            <Link href="/login?next=/profile" className="btn green">{t("signIn")}</Link>
          </div>
        )}
        {p && (
          <>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{p.name || p.email}</div>
              <div className="meta">{p.phone ? `${p.phone.slice(0, 6)} ··· ··· · ${t("waVerified")}` : p.email}</div>
            </div>
            {p.referral_code && (
              <div className="card tint pad">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t("refTitle")}: {p.referral_code}</div>
                    <div className="meta">{t("refSub")}{Number(p.credit) > 0 ? ` · $${Number(p.credit).toFixed(0)} ${t("credit")}` : ""}</div>
                  </div>
                  <button className="btn line sm" onClick={shareCode}>{t("share")}</button>
                </div>
              </div>
            )}
          </>
        )}
        <div>
          <h2 style={{ margin: "8px 0 4px" }}>{t("settings")}</h2>
          <button className="list-btn" onClick={() => setLang(lang === "en" ? "ar" : "en")}><span>{t("language")}</span><span className="v">{t("langName")}</span></button>
          <button className="list-btn" onClick={() => setCity(city ? "" : "Beirut")}><span>{t("city")}</span><span className="v">{city || t("allCities")}</span></button>
          <button className="list-btn" onClick={() => toast(`USD ⇄ LBP ${FX_RATE.toLocaleString("en-US")}`)}><span>{t("currency")}</span><span className="v">USD · LBP {FX_RATE.toLocaleString("en-US")}</span></button>
          {p && <button className="list-btn" onClick={toggleWa}><span>{t("waReminders")}</span><span className="v">{(p.prefs?.wa_reminders ?? true) ? t("on") : t("off")}</span></button>}
        </div>
        {(roles.isOrganiser || roles.isDoor || roles.isAdmin) && (
          <div>
            <h2 style={{ margin: "8px 0 4px" }}>{t("venue")}</h2>
            {roles.isOrganiser && <Link href="/org" className="list-btn"><span>{orgs[0]?.name ? `${orgs[0].name} · ${t("orgMode")}` : t("orgMode")}</span><span className="v">{orgs[0]?.plan ? orgs[0].plan.toUpperCase() : ""} ›</span></Link>}
            {roles.isOrganiser && <Link href="/org/finance" className="list-btn"><span>{t("finance")}</span><span className="v">›</span></Link>}
            {roles.isDoor && <Link href="/org/door" className="list-btn"><span>{t("doorMode")}</span><span className="v">›</span></Link>}
            {roles.isAdmin && <a href={BACKOFFICE_URL} className="list-btn"><span>{t("backOffice")}</span><span className="v">↗</span></a>}
          </div>
        )}
        <a href={`https://instagram.com/${IG_HANDLE}`} target="_blank" rel="noopener" className="moment"><div><div style={{ fontWeight: 600, fontSize: 14 }}>😎 @{IG_HANDLE}</div><div className="small" style={{ color: "var(--g1)" }}>Where every image is a story</div></div><span>↗</span></a>
        {roles.user && <button className="btn line full" onClick={() => sb().auth.signOut().then(() => location.assign("/"))}>{t("signOut")}</button>}
        <p className="small" style={{ textAlign: "center" }}>{t("demoNote")}</p>
      </main>
    </>
  );
}
