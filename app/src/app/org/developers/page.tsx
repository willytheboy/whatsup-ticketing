"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/Toast";
import { sb } from "@/lib/supabase-browser";
import { useT } from "@/lib/lang";
import { useOrg } from "@/lib/org";

type Key = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };
type Hook = { id: string; url: string; secret: string; events: string[]; active: boolean; created_at: string };
type Delivery = { id: number; event: string; created_at: string; endpoint_id: string };

/** Developers (spec §platform): API keys for /api/v1 and signed webhooks (order.paid, ticket.scanned). */
export default function Developers() {
  const t = useT();
  const toast = useToast();
  const { user, org } = useOrg();
  const [keys, setKeys] = useState<Key[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [fresh, setFresh] = useState<string>("");
  const [keyName, setKeyName] = useState("POS");
  const [url, setUrl] = useState("");
  const load = async () => {
    if (!org) return;
    const [{ data: k }, { data: h }, { data: d }] = await Promise.all([
      sb().from("api_keys").select("id,name,prefix,created_at,last_used_at").eq("organiser_id", org.id).order("created_at", { ascending: false }),
      sb().from("webhook_endpoints").select("*").eq("organiser_id", org.id).order("created_at", { ascending: false }),
      sb().from("webhook_deliveries").select("id,event,created_at,endpoint_id").order("created_at", { ascending: false }).limit(10),
    ]);
    setKeys((k ?? []) as Key[]); setHooks((h ?? []) as Hook[]); setDeliveries((d ?? []) as Delivery[]);
  };
  useEffect(() => { load(); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createKey = async () => {
    if (!org) return;
    const { data, error } = await sb().rpc("create_api_key", { p_org: org.id, p_name: keyName || "key" });
    if (error) return toast(error.message);
    setFresh(String(data)); load();
  };
  const revoke = async (id: string) => { await sb().from("api_keys").delete().eq("id", id); load(); };
  const addHook = async () => {
    if (!org || !/^https:\/\//.test(url)) return toast(t("httpsOnly"));
    const { error } = await sb().from("webhook_endpoints").insert({ organiser_id: org.id, url });
    if (error) return toast(error.message);
    setUrl(""); load();
  };
  const toggleHook = async (h: Hook) => { await sb().from("webhook_endpoints").update({ active: !h.active }).eq("id", h.id); load(); };
  const removeHook = async (h: Hook) => { await sb().from("webhook_endpoints").delete().eq("id", h.id); load(); };
  const copy = (s: string) => { navigator.clipboard?.writeText(s); toast(t("copied")); };
  const base = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <TopBar back="/org" title={t("developers")} />
      <main>
        {user === null && <div className="card pad stack"><p style={{ margin: 0 }}>{t("signInOrg")}</p><Link href="/login?next=/org/developers" className="btn green">{t("signIn")}</Link></div>}
        {org && (
          <>
            <div className="card pad stack">
              <div className="eyebrow">{t("apiKeys")}</div>
              <div className="small">{t("apiNote")} <code>GET {base}/api/v1/events</code> · <code>GET {base}/api/v1/orders?since=</code> · <code>X-Api-Key</code></div>
              {fresh && <div className="card sand pad" style={{ fontSize: 13 }}><b>{t("keyOnce")}</b><div className="num" style={{ wordBreak: "break-all", marginTop: 4 }}>{fresh}</div><button className="btn xs line" style={{ marginTop: 6 }} onClick={() => copy(fresh)}>{t("copyLink")}</button></div>}
              <div className="row" style={{ gap: 8 }}><input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="POS" style={{ flex: 1 }} /><button className="btn sm green" onClick={createKey}>{t("newKey")}</button></div>
              {keys.map((k) => <div key={k.id} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span className="small"><b>{k.name}</b> · <span className="num">{k.prefix}…</span> · {k.last_used_at ? `${t("lastUsed")} ${new Date(k.last_used_at).toLocaleDateString("en-GB")}` : t("neverUsed")}</span><button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => revoke(k.id)}>{t("revoke")}</button></div>)}
            </div>
            <div className="card pad stack">
              <div className="eyebrow">{t("webhooks")}</div>
              <div className="small">{t("webhookNote")}</div>
              <div className="row" style={{ gap: 8 }}><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.com/whatsup" style={{ flex: 1 }} /><button className="btn sm green" onClick={addHook}>{t("add")}</button></div>
              {hooks.map((h) => (
                <div key={h.id} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="row"><span className="small" style={{ wordBreak: "break-all", opacity: h.active ? 1 : 0.5 }}>{h.url}</span><div className="row" style={{ gap: 6, flex: "none" }}><button className="btn xs line" onClick={() => toggleHook(h)}>{h.active ? t("pause") : t("resume")}</button><button className="btn xs line" style={{ color: "var(--red-dark)" }} onClick={() => removeHook(h)}>✕</button></div></div>
                  <div className="small num" style={{ marginTop: 4 }}>{t("secret")}: {h.secret} <button className="btn xs line" onClick={() => copy(h.secret)}>{t("copyLink")}</button> · {h.events.join(", ")}</div>
                </div>
              ))}
              {deliveries.length > 0 && <div className="small">{t("recent")}: {deliveries.map((d) => `${d.event} ${new Date(d.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`).join(" · ")}</div>}
            </div>
            <div className="small">{t("docsAt")} <a href="https://github.com/willytheboy/whatsup-ticketing/blob/main/docs/API.md" style={{ color: "var(--g1)" }}>docs/API.md</a></div>
          </>
        )}
      </main>
    </>
  );
}
