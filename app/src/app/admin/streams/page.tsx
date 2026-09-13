"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { money } from "@/lib/config";
import { useAdmin } from "../_lib";
import { Panel, Tag, statusTone, Modal, Empty, when } from "../_ui";

const EMPTY = { title: "", title_ar: "", slug: "", venue_id: "", event_id: "", kind: "audio", source: "hls", playback_url: "", ingest_url: "", stream_key: "", access: "public", pass_price: "0", cover_url: "", description: "" };

/** Venue streams: audio/video feeds shown under Live. Ingest credentials are only readable by the venue's partner members and admins. */
export default function Streams() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    const t = admin.tenant.id;
    const [{ data: s }, { data: v }, { data: e }] = await Promise.all([
      sb().from("streams").select("*, venues(name), events(title), partners(name)").eq("tenant_id", t).order("created_at", { ascending: false }),
      sb().from("venues").select("id,name,city").eq("tenant_id", t).order("name"),
      sb().from("events").select("id,title").eq("tenant_id", t).in("status", ["live", "sold_out", "draft"]).order("starts_at"),
    ]);
    setRows(s ?? []);
    setVenues(v ?? []);
    setEvents(e ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setMsg("");
    const { data: partner } = await sb().from("partners").select("id").eq("venue_id", edit.venue_id).maybeSingle();
    if (!partner) return setMsg("Pick a venue — its partner account owns the stream.");
    const payload = {
      tenant_id: admin.tenant!.id, venue_id: edit.venue_id, partner_id: partner.id, event_id: edit.event_id || null,
      slug: edit.slug || edit.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      title: edit.title, title_ar: edit.title_ar || null, kind: edit.kind, source: edit.source, playback_url: edit.playback_url || null,
      ingest_url: edit.ingest_url || null, stream_key: edit.stream_key || null, access: edit.access, pass_price: Number(edit.pass_price || 0),
      cover_url: edit.cover_url || null, description: edit.description || null,
    };
    const { error } = edit.id ? await sb().from("streams").update(payload).eq("id", edit.id) : await sb().from("streams").insert(payload);
    if (error) return setMsg(error.message);
    setEdit(null);
    load();
  };
  const setStatus = async (id: string, status: string) => { await sb().rpc("set_stream_status", { p_stream: id, p_status: status }); load(); };
  const showCreds = async (id: string) => {
    const { data } = await sb().rpc("stream_credentials", { p_stream: id });
    setCreds({ ...creds, [id]: data });
  };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Streams</h1>
          <p className="sub">What listeners see under Live. Access: public, ticket holders of the linked event, or a paid 24-hour pass (70% to the venue).</p>
        </div>
        <button className="btn green sm" onClick={() => setEdit({ ...EMPTY })}>New stream</button>
      </div>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No streams yet.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Stream</th><th>Venue</th><th>Kind</th><th>Access</th><th>Status</th><th className="r">Listeners</th><th>Started</th><th></th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.title}</b><div className="dim">/live/{s.slug}{s.events?.title ? ` · ${s.events.title}` : ""}</div></td>
                    <td>{s.venues?.name}</td>
                    <td>{s.kind} · {s.source}</td>
                    <td>{s.access}{s.access === "pass" ? ` · ${money(Number(s.pass_price))}` : ""}</td>
                    <td><Tag tone={statusTone(s.status)}>{s.status}</Tag></td>
                    <td className="r">{s.listeners}</td>
                    <td className="w dim">{s.started_at ? when(s.started_at) : "—"}</td>
                    <td className="w">
                      {s.status !== "live" ? <button className="btn green xs" onClick={() => setStatus(s.id, "live")}>Go live</button> : <button className="btn ghost xs" onClick={() => setStatus(s.id, "ended")}>End</button>}{" "}
                      <button className="btn ghost xs" onClick={() => setEdit({ ...EMPTY, ...s, pass_price: String(s.pass_price ?? 0), venue_id: s.venue_id ?? "", event_id: s.event_id ?? "" })}>Edit</button>{" "}
                      <button className="btn ghost xs" onClick={() => showCreds(s.id)}>Ingest</button>
                      {creds[s.id] && <div className="dim mono" style={{ marginTop: 4 }}>{creds[s.id].ingest_url ?? "—"}<br />{creds[s.id].stream_key ?? ""}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {edit && (
        <Modal title={edit.id ? "Edit stream" : "New stream"} onClose={() => setEdit(null)}>
          <div className="form">
            <div className="field"><span className="label">Title</span><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="field"><span className="label">Arabic title</span><input dir="rtl" value={edit.title_ar ?? ""} onChange={(e) => setEdit({ ...edit, title_ar: e.target.value })} /></div>
            <div className="field"><span className="label">Slug</span><input value={edit.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} placeholder="auto from title" /></div>
            <div className="field"><span className="label">Venue</span><select value={edit.venue_id} onChange={(e) => setEdit({ ...edit, venue_id: e.target.value })}><option value="">—</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.city}</option>)}</select></div>
            <div className="field"><span className="label">Linked event</span><select value={edit.event_id} onChange={(e) => setEdit({ ...edit, event_id: e.target.value })}><option value="">—</option>{events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></div>
            <div className="field"><span className="label">Kind</span><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option>audio</option><option>video</option></select></div>
            <div className="field"><span className="label">Source</span><select value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })}><option>hls</option><option>youtube</option><option>url</option></select></div>
            <div className="field"><span className="label">Access</span><select value={edit.access} onChange={(e) => setEdit({ ...edit, access: e.target.value })}><option>public</option><option>ticket_holders</option><option>pass</option></select></div>
            <div className="field"><span className="label">Pass price $</span><input inputMode="decimal" value={edit.pass_price} onChange={(e) => setEdit({ ...edit, pass_price: e.target.value })} /></div>
            <div className="field"><span className="label">Playback URL</span><input value={edit.playback_url ?? ""} onChange={(e) => setEdit({ ...edit, playback_url: e.target.value })} placeholder="https://…/index.m3u8" /></div>
            <div className="field"><span className="label">Ingest URL</span><input value={edit.ingest_url ?? ""} onChange={(e) => setEdit({ ...edit, ingest_url: e.target.value })} placeholder="rtmp://…" /></div>
            <div className="field"><span className="label">Stream key</span><input value={edit.stream_key ?? ""} onChange={(e) => setEdit({ ...edit, stream_key: e.target.value })} /></div>
            <div className="field"><span className="label">Cover URL</span><input value={edit.cover_url ?? ""} onChange={(e) => setEdit({ ...edit, cover_url: e.target.value })} /></div>
          </div>
          <div className="field"><span className="label">Description</span><textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          {msg && <div className="err">{msg}</div>}
          <button className="btn green sm" disabled={!edit.title || !edit.venue_id} onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}
