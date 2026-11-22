import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type { FarmSummary, Region, Role, User } from "./types";

const ROLES: Role[] = ["FARMER", "AGRONOMIST", "ADMIN"];
const CROPS = ["olive", "wheat", "tomato"] as const;

type NewFarm = {
  name: string;
  region_id: number | "";
  owner_id: number | "";
  crop: (typeof CROPS)[number];
  area_ha: number;
};

const emptyFarm: NewFarm = {
  name: "",
  region_id: "",
  owner_id: "",
  crop: "olive",
  area_ha: 1,
};

export default function AdminView() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [farms, setFarms] = useState<FarmSummary[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [picked, setPicked] = useState<Record<number, number | "">>({});
  const [ownerPick, setOwnerPick] = useState<Record<number, number | "">>({});
  const [draft, setDraft] = useState<NewFarm>(emptyFarm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [loadedUsers, loadedFarms, loadedRegions] = await Promise.all([
        api<User[]>("/users"),
        api<FarmSummary[]>("/farms"),
        api<{ regions: Region[] }>("/regions"),
      ]);
      setUsers(loadedUsers);
      setFarms(loadedFarms);
      setRegions(loadedRegions.regions);
      const entries = await Promise.all(
        loadedFarms.map(async (farm) => {
          const list = await api<User[]>(`/farms/${farm.id}/agronomists`);
          return [farm.id, list.map((u) => u.id)] as const;
        }),
      );
      setAssignments(Object.fromEntries(entries));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(uid: number, role: Role) {
    setError("");
    setNotice("");
    try {
      const updated = await api<User>(`/users/${uid}/role`, { role });
      setUsers((list) => list.map((u) => (u.id === uid ? updated : u)));
      setNotice(t("roleUpdated"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createFarm() {
    if (draft.region_id === "" || draft.name.trim() === "") {
      setError(t("farmInputsRequired"));
      return;
    }
    setError("");
    setNotice("");
    try {
      await api("/farms", {
        name: draft.name.trim(),
        region_id: draft.region_id,
        owner_id: draft.owner_id === "" ? null : draft.owner_id,
        crop: draft.crop,
        area_ha: draft.area_ha,
      });
      setDraft(emptyFarm);
      await load();
      setNotice(t("farmCreated"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function assignOwner(fid: number) {
    const userId = ownerPick[fid];
    if (userId === undefined || userId === "") return;
    setError("");
    setNotice("");
    try {
      await api(`/farms/${fid}/owner`, { user_id: userId });
      setFarms((list) =>
        list.map((farm) =>
          farm.id === fid
            ? {
                ...farm,
                owner_id: userId,
                owner: userById.get(userId)?.full_name ?? null,
              }
            : farm,
        ),
      );
      setOwnerPick((map) => ({ ...map, [fid]: "" }));
      setNotice(t("ownerUpdated"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function assign(fid: number) {
    const userId = picked[fid];
    if (userId === undefined || userId === "") return;
    setError("");
    setNotice("");
    try {
      await api(`/farms/${fid}/agronomists`, { user_id: userId });
      setAssignments((map) => ({
        ...map,
        [fid]: [...new Set([...(map[fid] ?? []), userId])],
      }));
      setPicked((map) => ({ ...map, [fid]: "" }));
      setNotice(t("assignmentSaved"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function unassign(fid: number, userId: number) {
    setError("");
    setNotice("");
    try {
      await api(`/farms/${fid}/agronomists/remove`, { user_id: userId });
      setAssignments((map) => ({
        ...map,
        [fid]: (map[fid] ?? []).filter((id) => id !== userId),
      }));
      setNotice(t("assignmentSaved"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const farmers = users.filter((u) => u.role === "FARMER");
  const agronomists = users.filter((u) => u.role === "AGRONOMIST");
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">{t("admin")}</span>
          <h1>{t("userManagement")}</h1>
          <p>{t("agronomistOnlyHint")}</p>
        </div>
        <button onClick={load} disabled={busy}>
          <RefreshCw size={16} />
          {t("retry")}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice warning">
          {t(error, { defaultValue: t("error") })}
        </p>
      )}
      {notice && <p className="success">{notice}</p>}

      <Panel title={t("userManagement")} aside={<UserCog size={17} />}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["fullName", "email", "role"].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(role)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t("createFarm")} aside={<Building2 size={17} />}>
        <p className="caption">{t("farmOwnershipHint")}</p>
        <div className="form-grid compact">
          <label>
            {t("farmName")}
            <input
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder={t("farmName")}
            />
          </label>
          <label>
            {t("region")}
            <select
              value={draft.region_id}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  region_id: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            >
              <option value="" disabled>
                —
              </option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("ownerLabel")}
            <select
              value={draft.owner_id}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  owner_id: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            >
              <option value="">{t("unassigned")}</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("crop")}
            <select
              value={draft.crop}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  crop: e.target.value as NewFarm["crop"],
                }))
              }
            >
              {CROPS.map((crop) => (
                <option key={crop} value={crop}>
                  {t(crop)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("area")}
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={draft.area_ha}
              onChange={(e) =>
                setDraft((d) => ({ ...d, area_ha: Number(e.target.value) }))
              }
            />
          </label>
        </div>
        <button
          type="button"
          onClick={createFarm}
          disabled={busy || draft.name.trim() === "" || draft.region_id === ""}
        >
          <Plus size={15} />
          {t("create")}
        </button>
      </Panel>

      <Panel title={t("farmOwnership")} aside={<ShieldCheck size={17} />}>
        {farms.length === 0 ? (
          <p>{t("noFarms")}</p>
        ) : (
          farms.map((farm) => (
            <div className="assignment-row" key={farm.id}>
              <div className="assignment-farm">
                <strong>{farm.name}</strong>
                <small>{farm.region}</small>
                <small>
                  {t("ownerLabel")}:{" "}
                  {farm.owner ?? t("unassigned")}
                </small>
              </div>
              <div className="assignment-add">
                <label className="sr-only" htmlFor={`own-${farm.id}`}>
                  {t("assignTo")}
                </label>
                <select
                  id={`own-${farm.id}`}
                  value={ownerPick[farm.id] ?? ""}
                  onChange={(e) =>
                    setOwnerPick((map) => ({
                      ...map,
                      [farm.id]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => assignOwner(farm.id)}>
                  <Plus size={15} />
                  {t("assign")}
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title={t("farmAssignment")} aside={<ShieldCheck size={17} />}>
        {farms.length === 0 ? (
          <p>{t("noAssignedFarms")}</p>
        ) : (
          farms.map((farm) => (
            <div className="assignment-row" key={farm.id}>
              <div className="assignment-farm">
                <strong>{farm.name}</strong>
                <small>{farm.region}</small>
              </div>
              <div className="assignment-tags">
                {(assignments[farm.id] ?? []).map((uid) => (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => unassign(farm.id, uid)}
                    aria-label={t("remove")}
                  >
                    {userById.get(uid)?.full_name ?? uid}
                    <Trash2 size={13} />
                  </button>
                ))}
              </div>
              <div className="assignment-add">
                <label className="sr-only" htmlFor={`pick-${farm.id}`}>
                  {t("assign")}
                </label>
                <select
                  id={`pick-${farm.id}`}
                  value={picked[farm.id] ?? ""}
                  onChange={(e) =>
                    setPicked((map) => ({
                      ...map,
                      [farm.id]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {agronomists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => assign(farm.id)}>
                  <Plus size={15} />
                  {t("assign")}
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>
    </>
  );
}
