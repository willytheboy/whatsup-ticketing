"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase-browser";
import { useAdmin } from "../_lib";
import { Panel, Tag, Empty } from "../_ui";

const ROLES = ["organiser", "door", "promoter", "country_admin", "super_admin"];

/** Tenant memberships: who can organise, scan at the door, promote, or run the back office. */
export default function Team() {
  const admin = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [organisers, setOrganisers] = useState<any[]>([]);
  const [form, setForm] = useState({ email: "", role: "organiser", organiser_id: "" });
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!admin.tenant) return;
    const [{ data: m }, { data: o }] = await Promise.all([
      sb().from("v_admin_members").select("*").eq("tenant_id", admin.tenant.id).order("role"),
      sb().from("organisers").select("id,name").eq("tenant_id", admin.tenant.id).order("name"),
    ]);
    setRows(m ?? []);
    setOrganisers(o ?? []);
  };
  useEffect(() => { load(); }, [admin.tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  const grant = async (remove = false, row?: any) => {
    setMsg("");
    const { data, error } = await sb().rpc("admin_set_membership", {
      p_tenant: admin.tenant!.id,
      p_email: row ? row.email : form.email,
      p_role: row ? row.role : form.role,
      p_organiser: row ? row.organiser_id : form.organiser_id || null,
      p_remove: remove,
    });
    if (error) return setMsg(error.message);
    setMsg(data ? (remove ? "Role removed" : "Role granted") : "No account with that email — ask them to sign in to the app once first.");
    load();
  };

  return (
    <>
      <div className="bo-head">
        <div>
          <h1>Team</h1>
          <p className="sub">Roles are per email. Organiser and door roles are scoped to an organiser; admins see everything.</p>
        </div>
      </div>
      <Panel title="Grant a role">
        <div className="form">
          <div className="field"><span className="label">Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><span className="label">Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="field"><span className="label">Organiser</span><select value={form.organiser_id} onChange={(e) => setForm({ ...form, organiser_id: e.target.value })}><option value="">—</option>{organisers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <button className="btn green sm" disabled={!form.email} onClick={() => grant(false)}>Grant</button>
        </div>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
      </Panel>
      <Panel>
        {rows === null ? <Empty>Loading…</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Organiser</th><th></th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={`${m.user_id}-${m.role}`}>
                    <td>{m.name ?? "—"}</td>
                    <td>{m.email ?? "—"}</td>
                    <td>{m.phone ?? "—"}</td>
                    <td><Tag tone={["super_admin", "country_admin"].includes(m.role) ? "info" : undefined}>{m.role}</Tag></td>
                    <td>{m.organiser_name ?? "—"}</td>
                    <td>{m.email && m.user_id !== admin.user?.id && <button className="btn ghost xs" onClick={() => confirm(`Remove ${m.role} from ${m.email}?`) && grant(true, m)}>Remove</button>}</td>
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
