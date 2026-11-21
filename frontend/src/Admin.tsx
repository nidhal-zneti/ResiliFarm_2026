import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type { FarmSummary, Role, User } from "./types";

const ROLES: Role[] = ["FARMER", "AGRONOMIST", "ADMIN"];

export default function AdminView() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [farms, setFarms] = useState<FarmSummary[]>([]);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [picked, setPicked] = useState<Record<number, number | "">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [loadedUsers, loadedFarms] = await Promise.all([
        api<User[]>("/users"),
        api<FarmSummary[]>("/farms"),
      ]);
      setUsers(loadedUsers);
      setFarms(loadedFarms);
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
