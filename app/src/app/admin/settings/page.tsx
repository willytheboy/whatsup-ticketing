"use client";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty } from "../_ui";
import { DEFAULT_BRAND, DEFAULT_CONFIG, FEATURES, FEATURE_IDS, TAB_IDS, THEMES, mergeConfig, type Brand, type FeatureId, type TabId, type TenantConfig, type ThemeId } from "@/lib/features";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://whatsup-ticketing-app.vercel.app";
const TAB_LABEL: Record<TabId, string> = { home: "Home", search: "Search", ask: "Ask", radio: "Radio", vibe: "Vibe", wallet: "Wallet" };
const BRAND_FIELDS: [keyof Brand, string, string][] = [
  ["name", "Brand name", "What's Up"], ["name_ar", "Brand name (Arabic)", "شو في"],
  ["country", "Country / market", "Lebanon"], ["country_ar", "Country (Arabic)", "لبنان"],
  ["ig", "Instagram handle", "whatsuplebanon"], ["support_wa", "Support WhatsApp (digits)", "96170000000"],
  ["short_host", "Short link host", "wul.app"], ["tagline", "Tagline", "Everything to do in Lebanon — tickets on WhatsApp."], ["tagline_ar", "Tagline (Arabic)", "كل شي بيصير بلبنان — تذاكرك عالواتساب."],
];

/** Settings (v0.7): what the client app shows for this tenant — theme, bottom tabs, features (pages, sheets, modals), brand.
    Saved to tenants.config + tenants.brand; the app reads them on every request. */
export default function Settings() {
  const admin = useAdmin();
  const [cfg, setCfg] = useState<TenantConfig | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = async () => {
    if (!admin.tenant) return;
    const { data } = await sb().from("tenants").select("config,brand,name,country,country_ar").eq("id", admin.tenant.id).maybeSingle();
    const c = mergeConfig(data?.config, data?.brand, data ?? undefined);
    setCfg(c); setSaved(JSON.stringify(c));
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => !!cfg && JSON.stringify(cfg) !== saved, [cfg, saved]);
  const groups = useMemo(() => { const g = new Map<string, FeatureId[]>(); for (const id of FEATURE_IDS) { const k = FEATURES[id].group; g.set(k, [...(g.get(k) ?? []), id]); } return [...g.entries()]; }, []);

  const save = async () => {
    if (!cfg || !admin.tenant) return;
    setBusy(true); setMsg("");
    const brand: Partial<Brand> = {};
    for (const k of Object.keys(DEFAULT_BRAND) as (keyof Brand)[]) if (cfg.brand[k] !== DEFAULT_BRAND[k]) brand[k] = cfg.brand[k];
    const { error } = await sb().from("tenants").update({ config: { theme: cfg.theme, tabs: cfg.tabs, features: cfg.features }, brand }).eq("id", admin.tenant.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    setSaved(JSON.stringify(cfg)); setMsg("Saved. The app picks it up on the next page load.");
  };
  const reset = () => setCfg((c) => c && { ...DEFAULT_CONFIG, brand: c.brand });
  const setAll = (on: boolean) => setCfg((c) => c && { ...c, features: Object.fromEntries(FEATURE_IDS.map((k) => [k, on])) as Record<FeatureId, boolean> });

  if (!admin.loaded || cfg === null) return <Empty>Loading…</Empty>;
  if (!admin.isAdmin) return <Empty>Tenant admins only.</Empty>;
  const offCount = FEATURE_IDS.filter((k) => !cfg.features[k]).length;

  return (
    <>
      <div className="bo-head">
        <div><h1>Settings</h1><p className="sub">What the client app shows for <b>{admin.tenant?.name}</b>: theme, tabs, features (pages, sheets and modals) and brand. Nothing here touches money.</p></div>
        <div className="row" style={{ gap: 8 }}>
          {dirty && <Tag tone="warn">unsaved</Tag>}
          <button className="btn ghost xs" onClick={reset}>Reset to defaults</button>
          <button className="btn green sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      {msg && <div className="note" style={{ marginBottom: 12 }}>{msg}</div>}

      <Panel title="Theme" action={<a className="btn ghost xs" href={`${APP_URL}/?theme=${cfg.theme}`} target="_blank" rel="noopener">Preview in the app ↗</a>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {THEMES.map((th) => (
            <div key={th.id} className="card" style={{ overflow: "hidden", outline: cfg.theme === th.id ? "3px solid var(--ink)" : "1px solid var(--line)", outlineOffset: -1 }}>
              <div style={{ display: "flex", height: 54 }} aria-hidden>{th.swatch.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}</div>
              <div className="pad">
                <div className="row between"><b>{th.name}</b>{cfg.theme === th.id ? <Tag tone="ok">active</Tag> : th.id === "cedar" ? <Tag>default</Tag> : null}</div>
                <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{th.line}</div>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button className={`btn xs ${cfg.theme === th.id ? "ghost" : "green"}`} disabled={cfg.theme === th.id} onClick={() => setCfg({ ...cfg, theme: th.id as ThemeId })}>{cfg.theme === th.id ? "Selected" : "Use this theme"}</button>
                  <a className="btn ghost xs" href={`${APP_URL}/?theme=${th.id}`} target="_blank" rel="noopener">Preview ↗</a>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 12, margin: "10px 0 0" }}>Previews set a cookie in that browser only (<code>?theme=tenant</code> clears it). The saved theme applies to everyone. Contrast is checked for every theme: button text ≥ 4.5:1, band wordmark ≥ 3:1.</p>
      </Panel>

      <Panel title="Bottom tabs">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {TAB_IDS.map((id) => (
            <label key={id} className={`chip ${cfg.tabs[id] ? "on" : ""}`} style={{ cursor: id === "home" ? "default" : "pointer" }}>
              <input type="checkbox" checked={cfg.tabs[id]} disabled={id === "home"} onChange={(e) => setCfg({ ...cfg, tabs: { ...cfg.tabs, [id]: e.target.checked } })} style={{ display: "none" }} />
              {TAB_LABEL[id]}
            </label>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 12, margin: "10px 0 0" }}>Home is always on. A tab also disappears when its feature is off (Ask → Concierge, Radio → Radio, Vibe → Vibe). Pages stay reachable by link; the feature switch below is what actually turns a surface off.</p>
      </Panel>

      <Panel title={`Features · ${FEATURE_IDS.length - offCount} on, ${offCount} off`} action={<div className="row" style={{ gap: 6 }}><button className="btn ghost xs" onClick={() => setAll(true)}>All on</button><button className="btn ghost xs" onClick={() => setAll(false)}>All off</button></div>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {groups.map(([group, ids]) => (
            <div key={group} className="card pad">
              <div className="eyebrow" style={{ marginBottom: 8 }}>{group}</div>
              {ids.map((id) => (
                <label key={id} className="row" style={{ gap: 10, padding: "7px 0", borderTop: "1px solid var(--line)", cursor: "pointer", alignItems: "flex-start" }}>
                  <input type="checkbox" checked={cfg.features[id]} onChange={(e) => setCfg({ ...cfg, features: { ...cfg.features, [id]: e.target.checked } })} style={{ width: 18, height: 18, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{FEATURES[id].label} <code className="dim" style={{ fontWeight: 400, fontSize: 11 }}>{id}</code></div>
                    <div className="dim" style={{ fontSize: 12 }}>{FEATURES[id].desc}</div>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Brand">
        <div className="form">
          {BRAND_FIELDS.map(([k, label, ph]) => (
            <div key={k} className="field"><span className="label">{label}</span><input dir={k.endsWith("_ar") ? "rtl" : undefined} value={cfg.brand[k]} onChange={(e) => setCfg({ ...cfg, brand: { ...cfg.brand, [k]: e.target.value } })} placeholder={ph} /></div>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 12, margin: "10px 0 0" }}>Used in the wordmark, the app title, story cards, share copy and the concierge hand-off. Copy that mentions the built-in brand (What's Up, Lebanon, @whatsuplebanon, #WeAreLebanon, wul.app) is swapped for these values everywhere. Logo, icons and the splash screen are files under <code>public/</code> and <code>assets/</code> — see docs/DESIGN.md for the rebrand checklist.</p>
      </Panel>
    </>
  );
}
