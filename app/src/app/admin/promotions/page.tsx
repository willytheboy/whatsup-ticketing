"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty, when } from "../_ui";

/** Promotion queue: every Boost, Story bundle and Takeover bought by organisers; editors mark the creative delivered. */
export default function Promotions() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = async () => { if (!admin.tenant) return; const { data } = await sb().from("v_admin_promotions").select("*").eq("tenant_id", admin.tenant.id).order("created_at", { ascending: false }).limit(200); setRows(data ?? []); };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const deliver = async (r: any, undo = false) => { await sb().from("promotion_orders").update({ delivered_at: undo ? null : new Date().toISOString(), notes: notes[r.id] ?? r.notes }).eq("id", r.id); load(); };
  const open = (rows ?? []).filter((r) => !r.delivered_at);
  const rev = (rows ?? []).reduce((a, r) => a + Number(r.price), 0);
  return (
    <>
      <div className="bo-head"><div><h1>Promotions</h1><p className="sub">{open.length} to deliver · {money(rev)} sold all-time. Boost is automatic (featured on Home); Story bundles and Takeovers need the editors.</p></div></div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No promotions bought yet.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Bought</th><th>Package</th><th>Listing</th><th>Organiser</th><th className="r">Paid</th><th>Featured until</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="w dim">{when(r.created_at)}</td>
                    <td><Tag tone={r.package === "takeover" ? "info" : r.package === "story" ? "warn" : "ok"}>{r.package}</Tag></td>
                    <td><a href={`/e/${r.event_slug}`} target="_blank" rel="noopener">{r.event_title}</a></td>
                    <td>{r.organiser}</td>
                    <td className="r">{money(Number(r.price))}</td>
                    <td className="w dim">{r.featured_until ? when(r.featured_until) : "—"}</td>
                    <td><input value={notes[r.id] ?? r.notes ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="Story posted 14 Sep…" style={{ minWidth: 180 }} /></td>
                    <td>{r.delivered_at ? <button className="btn ghost xs" onClick={() => deliver(r, true)}>Delivered ✓</button> : <button className="btn green xs" onClick={() => deliver(r)}>Mark delivered</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
