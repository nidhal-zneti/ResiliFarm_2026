import { useCallback, useEffect, useState } from "react";
import { api, setToken } from "./api";

type User = { id: number; email: string; full_name: string; phone?: string | null; role: "FARMER" | "AGRONOMIST" | "ADMIN"; is_active: boolean; created_at: string };
type Farm = { id: number; name: string; region_id: number; region: string; owner_id: number | null; owner: string | null };
type Region = { id: number; name: string; country_id: number };
type Device = { id: number; device_id: string; name: string; device_type: string; sensor_type: string; farm_id: number | null; installation_status: string; is_active: boolean; last_communication_at: string | null };
type FarmerAssignment = { id: number; agronomist_id: number; agronomist_name: string; farmer_id: number; farmer_name: string; farmer_email: string };
type Overview = { total_farmers: number; total_agronomists: number; total_farms: number; assigned_farms: number; unassigned_farms: number; iot_devices: number; recent_farmers: User[]; recent_farms: { id: number; name: string; created_at: string }[]; farms_without_owner: { id: number; name: string }[] };

const sections = ["Overview", "Farmers", "Agronomists", "Farms", "Assignments", "IoT Devices", "Settings"] as const;
type Section = typeof sections[number];

export default function AdminComplete() {
    const [section, setSection] = useState<Section>("Overview");
    const [overview, setOverview] = useState<Overview | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [farms, setFarms] = useState<Farm[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
    const [dialog, setDialog] = useState<null | "farmer" | "agronomist" | "farm" | "device" | "editUser" | "editFarm" | "editDevice">(null);
    const [selected, setSelected] = useState<any>(null);
    const [assignment, setAssignment] = useState({ farmId: "", farmerId: "", agronomists: [] as number[] });
    const [staffingAssignment, setStaffingAssignment] = useState({ agronomistId: "", farmerId: "" });
    const [farmerAssignments, setFarmerAssignments] = useState<FarmerAssignment[]>([]);

    const load = useCallback(async () => {
        setBusy(true); setError(""); try {
            const [s, us, fs, rg, ds, fa] = await Promise.all([api<Overview>("/admin/overview"), api<User[]>("/users"), api<Farm[]>("/farms"), api<{ regions: Region[] }>("/regions"), api<Device[]>("/admin/devices"), api<FarmerAssignment[]>("/admin/agronomist-assignments")]);
            setOverview(s); setUsers(us); setFarms(fs); setRegions(rg.regions); setDevices(ds); setFarmerAssignments(fa);
        } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
    }, []);
    useEffect(() => { load() }, [load]);

    async function createUser(role: "FARMER" | "AGRONOMIST") { const f = new FormData(document.querySelector(".admin-modal form") as HTMLFormElement); try { await api("/admin/users", { full_name: String(f.get("full_name")), email: String(f.get("email")), phone: String(f.get("phone") || ""), password: String(f.get("password")), role }); setDialog(null); setNotice(role + " created"); await load() } catch (e) { setError((e as Error).message) } }
    async function updateUser() { const f = new FormData(document.querySelector(".admin-modal form") as HTMLFormElement); try { await api(`/admin/users/${selected.id}`, { full_name: String(f.get("full_name")), email: String(f.get("email")), phone: String(f.get("phone") || "") }, 15000, "PATCH"); setDialog(null); setNotice("Account updated"); await load() } catch (e) { setError((e as Error).message) } }
    async function toggleUser(u: User) { if (u.id === selected?.id) { }; try { await api(`/admin/users/${u.id}/status`, { is_active: !u.is_active }); setNotice("Account status updated"); await load() } catch (e) { setError((e as Error).message) } }
    async function changeRole(u: User, role: User["role"]) { try { await api(`/users/${u.id}/role`, { role }); await load() } catch (e) { setError((e as Error).message) } }
    async function createFarm() { const f = new FormData(document.querySelector(".admin-modal form") as HTMLFormElement); try { const lat=String(f.get("latitude")||"").trim(), lon=String(f.get("longitude")||"").trim(); await api("/farms", { name: String(f.get("name")), region_id: Number(f.get("region_id")), owner_id: Number(f.get("owner_id")) || null, crop: String(f.get("crop") || "olive"), area_ha: Number(f.get("area_ha") || 1), latitude:lat?Number(lat):null, longitude:lon?Number(lon):null }); setDialog(null); setNotice("Farm created"); await load() } catch (e) { setError((e as Error).message) } }
    async function archiveFarm(id: number) { if (!confirm("Archive this farm? Historical records will be kept.")) return; try { await api(`/farms/${id}/archive`, {}); setNotice("Farm archived"); await load() } catch (e) { setError((e as Error).message) } }
    async function assignFarmer() { try { await api(`/farms/${Number(assignment.farmId)}/owner`, { user_id: Number(assignment.farmerId) }); setNotice("Farmer assigned"); await load() } catch (e) { setError((e as Error).message) } }
    async function assignFarmerToAgronomist() { const {agronomistId,farmerId}=staffingAssignment; if (!agronomistId || !farmerId) return; try { await api(`/admin/agronomists/${Number(agronomistId)}/farmers`, { farmer_id: Number(farmerId) }); setNotice("Farmer assigned to agronomist"); setStaffingAssignment(a => ({...a, farmerId: ""})); await load() } catch (e) { setError((e as Error).message) } }
    async function removeFarmerFromAgronomist(aid: number, fid: number) { try { await api(`/admin/agronomists/${aid}/farmers/${fid}`, undefined, 15000, "DELETE"); setNotice("Farmer removed from agronomist"); await load() } catch (e) { setError((e as Error).message) } }
    async function saveDevice() {
        const form = document.querySelector(".admin-modal form") as HTMLFormElement;
        const f = new FormData(form);
        const body = {
            device_id: String(f.get("device_id")),
            name: String(f.get("name")),
            device_type: String(f.get("device_type")),
            sensor_type: String(f.get("sensor_type")),
            farm_id: Number(f.get("farm_id")) || null,
            installation_status: String(f.get("installation_status") || "PENDING"),
            is_active: f.get("is_active") !== null,
        };
        try {
            if (dialog === "editDevice") await api(`/admin/devices/${selected.id}`, body, 15000, "PATCH");
            else await api("/admin/devices", body);
            setDialog(null); setNotice("Device saved"); await load();
        } catch (e) { setError((e as Error).message); }
    }

    const farmers = users.filter(u => u.role === "FARMER"); const agronomists = users.filter(u => u.role === "AGRONOMIST");
    const matches = (u: User) => `${u.full_name} ${u.email}`.toLowerCase().includes(search.toLowerCase());

    return <div className="admin-shell">
        <aside className="admin-sidebar"><div className="admin-brand"><span>R</span><div><strong>ResiliFarm</strong><small>Administration</small></div></div>
            <nav>{sections.map(s => <button key={s} className={section === s ? "active" : ""} onClick={() => setSection(s)}>{s}</button>)}</nav>
            <div className="admin-profile"><span>AD</span><div><strong>Administrator</strong><button type="button" onClick={() => setSection("Settings")}>Settings</button><button type="button" onClick={() => { setToken(null); location.hash = "profile"; location.reload() }}>Logout</button></div></div>
        </aside>
        <main className="admin-main"><header className="admin-header"><div><span>Admin workspace</span><h1>{section}</h1></div><button onClick={load} disabled={busy}>{busy ? "Loading…" : "Refresh"}</button></header>
            {error && <div className="admin-error">{error}</div>}{notice && <div className="admin-notice">{notice}</div>}
            {section === "Overview" && overview && <>
                <div className="admin-stats"><Stat label="Farmers" value={overview.total_farmers} /><Stat label="Agronomists" value={overview.total_agronomists} /><Stat label="Registered farms" value={overview.total_farms} /><Stat label="Assigned farms" value={overview.assigned_farms} /><Stat label="Unassigned farms" value={overview.unassigned_farms} /><Stat label="IoT devices" value={overview.iot_devices} /></div>
                <div className="admin-grid"><Panel title="Recent farmers">{overview.recent_farmers.length ? overview.recent_farmers.map(u => <Row key={u.id} title={u.full_name} detail={u.email} />) : <Empty text="No farmers registered." />}</Panel><Panel title="Recent farms">{overview.recent_farms.length ? overview.recent_farms.map(f => <Row key={f.id} title={f.name} detail={new Date(f.created_at).toLocaleDateString()} />) : <Empty text="No farms registered." />}</Panel><Panel title="Farms without a farmer">{overview.farms_without_owner.length ? overview.farms_without_owner.map(f => <Row key={f.id} title={f.name} detail="Unassigned" />) : <Empty text="All farms have a farmer." />}</Panel></div>
            </>}
            {(section === "Farmers" || section === "Agronomists") && <><Toolbar search={search} setSearch={setSearch} action={() => setDialog(section === "Farmers" ? "farmer" : "agronomist")} actionLabel={`Add ${section.slice(0, -1)}`} /><div className="admin-table"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead><tbody>{users.filter(u => u.role == (section === "Farmers" ? "FARMER" : "AGRONOMIST") && matches(u)).map(u => <tr key={u.id}><td><strong>{u.full_name}</strong></td><td>{u.email}</td><td>{u.phone || "—"}</td><td><span className={u.is_active ? "status active" : "status inactive"}>{u.is_active ? "Active" : "Inactive"}</span></td><td><select value={u.role} onChange={e => changeRole(u, e.target.value as User["role"])}><option>FARMER</option><option>AGRONOMIST</option><option>ADMIN</option></select></td><td><button onClick={() => { setSelected(u); setDialog("editUser") }}>Edit</button><button onClick={() => toggleUser(u)}>{u.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table>{users.filter(u => u.role == (section === "Farmers" ? "FARMER" : "AGRONOMIST") && matches(u)).length === 0 && <Empty text={`No ${section.toLowerCase()} found.`} />}</div></>}
            {section === "Farms" && <><Toolbar search={search} setSearch={setSearch} action={() => setDialog("farm")} actionLabel="Register farm" /><div className="admin-grid"><Panel title="Registered farms">{farms.filter(f => `${f.name} ${f.region}`.toLowerCase().includes(search.toLowerCase())).map(f => <div className="admin-list-row" key={f.id}><div><strong>{f.name}</strong><small>{f.region} · {f.owner || "Unassigned farmer"}</small></div><button onClick={() => archiveFarm(f.id)}>Archive</button></div>)}{farms.length === 0 && <Empty text="No farms registered." />}</Panel></div></>}
            {section === "Assignments" && <div className="admin-grid">
                <Panel title="Assign a farmer to a farm"><label>Farm<select value={assignment.farmId} onChange={e => setAssignment(a => ({ ...a, farmId: e.target.value }))}><option value="">Select farm</option>{farms.map(f => <option value={f.id} key={f.id}>{f.name}</option>)}</select></label><label>Farmer<select value={assignment.farmerId} onChange={e => setAssignment(a => ({ ...a, farmerId: e.target.value }))}><option value="">Select farmer</option>{farmers.map(u => <option value={u.id} key={u.id}>{u.full_name}</option>)}</select></label><button onClick={assignFarmer} disabled={!assignment.farmId || !assignment.farmerId}>Confirm farmer assignment</button></Panel>
                <Panel title="Assign farmers to agronomists"><label>Agronomist<select value={staffingAssignment.agronomistId} onChange={e => setStaffingAssignment(a => ({ ...a, agronomistId: e.target.value }))}><option value="">Select agronomist</option>{agronomists.map(a => <option value={a.id} key={a.id}>{a.full_name}</option>)}</select></label><label>Farmer<select value={staffingAssignment.farmerId} onChange={e => setStaffingAssignment(a => ({ ...a, farmerId: e.target.value }))}><option value="">Select farmer</option>{farmers.map(f => <option value={f.id} key={f.id}>{f.full_name}</option>)}</select></label><button onClick={assignFarmerToAgronomist} disabled={!staffingAssignment.agronomistId || !staffingAssignment.farmerId}>Assign farmer</button><p className="caption">An agronomist can work with multiple farmers. A farmer can also have more than one agronomist.</p></Panel>
                <Panel title="Current agronomist caseloads">{agronomists.map(a => { const assigned = farmerAssignments.filter(item => item.agronomist_id === a.id); return <div className="admin-list-row" key={a.id}><div><strong>{a.full_name}</strong><small>{assigned.length ? `${assigned.length} farmer${assigned.length === 1 ? "" : "s"}` : "No farmers assigned"}</small>{assigned.map(item => <small key={item.id}>{item.farmer_name} · {item.farmer_email} <button onClick={() => removeFarmerFromAgronomist(a.id,item.farmer_id)}>Remove</button></small>)}</div></div> })}{agronomists.length === 0 && <Empty text="Create an agronomist account first." />}</Panel>
            </div>}
            {section === "IoT Devices" && <><Toolbar search={search} setSearch={setSearch} action={() => setDialog("device")} actionLabel="Register device" /><div className="admin-table"><table><thead><tr><th>Device</th><th>Type</th><th>Sensor</th><th>Farm</th><th>Status</th><th>Last communication</th><th>Actions</th></tr></thead><tbody>{devices.filter(d => `${d.device_id} ${d.name}`.toLowerCase().includes(search.toLowerCase())).map(d => <tr key={d.id}><td><strong>{d.name}</strong><small>{d.device_id}</small></td><td>{d.device_type}</td><td>{d.sensor_type}</td><td>{farms.find(f => f.id === d.farm_id)?.name || "Unassigned"}</td><td>{d.is_active ? d.installation_status : "Inactive"}</td><td>{d.last_communication_at ? new Date(d.last_communication_at).toLocaleString() : "No telemetry"}</td><td><button onClick={() => { setSelected(d); setDialog("editDevice") }}>Edit</button></td></tr>)}</tbody></table>{devices.length === 0 && <Empty text="No IoT devices registered." />}</div></>}
            {section === "Settings" && <div className="admin-grid"><Panel title="Administrator profile"><p>Platform administrator settings and password management are available in Profile.</p><button onClick={() => location.hash = "profile"}>Open profile</button></Panel><Panel title="Platform preferences"><p>Regional language, contrast, text size and motion preferences are managed in Settings & accessibility.</p><button onClick={() => location.hash = "settings"}>Open settings</button></Panel></div>}
        </main>
        {dialog && <div className="admin-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null) }}><div className="admin-modal"><button className="modal-close" onClick={() => setDialog(null)}>×</button><h2>{dialog === "farmer" ? "Add farmer" : dialog === "agronomist" ? "Add agronomist" : dialog === "farm" ? "Register farm" : dialog === "editUser" ? "Edit account" : "Register device"}</h2>
            {(dialog === "farmer" || dialog === "agronomist" || dialog === "editUser") && <form onSubmit={e => { e.preventDefault(); dialog === "editUser" ? updateUser() : createUser(dialog === "farmer" ? "FARMER" : "AGRONOMIST") }}><label>Full name<input name="full_name" defaultValue={selected?.full_name || ""} required /></label><label>Email<input name="email" type="email" defaultValue={selected?.email || ""} required /></label><label>Phone<input name="phone" defaultValue={selected?.phone || ""} /></label>{dialog !== "editUser" && <label>Password<input name="password" type="password" minLength={8} required /></label>}<button className="primary" type="submit">Save account</button></form>}
            {dialog === "farm" && <form onSubmit={e => { e.preventDefault(); createFarm() }}><label>Farm name<input name="name" required /></label><label>Region<select name="region_id" required><option value="">Select region</option>{regions.map(r => <option value={r.id} key={r.id}>{r.name}</option>)}</select></label><label>Farm latitude (optional)<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="Use region center if blank" /></label><label>Farm longitude (optional)<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="Use region center if blank" /></label><label>Farmer<select name="owner_id"><option value="">Unassigned</option>{farmers.map(u => <option value={u.id} key={u.id}>{u.full_name}</option>)}</select></label><label>Crop<select name="crop"><option value="olive">Olive</option><option value="wheat">Wheat</option><option value="tomato">Tomato</option></select></label><label>Area (ha)<input name="area_ha" type="number" min="0.1" step="0.1" defaultValue="1" /></label><button className="primary" type="submit">Create farm</button></form>}
            {(dialog === "device" || dialog === "editDevice") && <form onSubmit={e => { e.preventDefault(); saveDevice() }}><label>Device ID<input name="device_id" defaultValue={selected?.device_id || ""} required /></label><label>Name<input name="name" defaultValue={selected?.name || ""} required /></label><label>Device type<input name="device_type" defaultValue={selected?.device_type || ""} required /></label><label>Sensor type<input name="sensor_type" defaultValue={selected?.sensor_type || ""} required /></label><label>Farm<select name="farm_id" defaultValue={selected?.farm_id || ""}><option value="">Unassigned</option>{farms.map(f => <option value={f.id} key={f.id}>{f.name}</option>)}</select></label><label>Status<select name="installation_status" defaultValue={selected?.installation_status || "PENDING"}><option>PENDING</option><option>INSTALLED</option><option>INACTIVE</option></select></label><label><input name="is_active" type="checkbox" defaultChecked={selected?.is_active !== false} /> Active device</label><button className="primary" type="submit">Save device</button></form>}
        </div></div>}
    </div>
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="admin-stat"><span>{label}</span><strong>{value}</strong></div> }
function Panel({ title, children }: { title: string; children: any }) { return <section className="admin-panel"><h2>{title}</h2>{children}</section> }
function Row({ title, detail }: { title: string; detail: string }) { return <div className="admin-list-row"><div><strong>{title}</strong><small>{detail}</small></div></div> }
function Toolbar({ search, setSearch, action, actionLabel }: { search: string; setSearch: (v: string) => void; action: () => void; actionLabel: string }) { return <div className="admin-toolbar"><input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} /><button onClick={action}>{actionLabel}</button></div> }
function Empty({ text }: { text: string }) { return <div className="admin-empty">{text}</div> }
