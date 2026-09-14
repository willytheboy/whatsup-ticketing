"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { SUPABASE_URL } from "@/lib/config";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty, when } from "../_ui";

/** #WeAreLebanon submissions: pick for the Monday feature (with credit) or reject. */
export default function Moments() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("new");
  const load = async () => { if (!admin.tenant) return; const { data } = await sb().from("v_admin_moments").select("*").eq("tenant_id", admin.tenant.id).order("created_at", { ascending: false }).limit(200); setRows(data ?? []); };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = async (r: any, status: string) => { await sb().from("moments").update({ status }).eq("id", r.id); load(); };
  const url = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/moments/${p}`;
  const list = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
  return (
    <>
      <div className="bo-head"><div><h1>Moments</h1><p className="sub">Photos and reels sent from the app. Picked moments go to @whatsuplebanon with the credit the sender asked for.</p></div>
        <div className="seg">{["new", "picked", "rejected", "all"].map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k}</button>)}</div></div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !list.length ? <Empty>Nothing here.</Empty> : (
          <div className="grid3">
            {list.map((r) => (
              <div key={r.id} className="card" style={{ overflow: "hidden" }}>
                <a href={url(r.path)} target="_blank" rel="noopener"><div style={{ height: 180, background: `#EAF3DE center/cover url(${url(r.path)})` }} /></a>
                <div className="pad">
                  <div className="row between"><b style={{ fontSize: 13 }}>{r.user_name ?? "—"}</b><Tag tone={r.status === "picked" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{r.status}</Tag></div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{r.caption || "—"}{r.credit ? ` · credit ${r.credit}` : ""} · {when(r.created_at)}</div>
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    {r.status !== "picked" && <button className="btn green xs" onClick={() => set(r, "picked")}>Pick</button>}
                    {r.status !== "rejected" && <button className="btn ghost xs" onClick={() => set(r, "rejected")}>Reject</button>}
                    {r.status !== "new" && <button className="btn ghost xs" onClick={() => set(r, "new")}>Back to new</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
