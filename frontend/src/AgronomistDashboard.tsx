import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardCheck,
  Droplets,
  Gauge,
  Sprout,
  Thermometer,
  Waves,
  Pencil,
  Trash2,
} from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type { AgronomistDashboard, AgronomistFarm, SavedRecommendationReview } from "./types";

const REVIEW_STATUSES = ["validated", "rejected", "modified"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];
type Icon = typeof Sprout;

function ReviewHistoryItem({ farmId, review, onChanged }: {
  farmId: number;
  review: SavedRecommendationReview;
  onChanged: (id: number, updated: SavedRecommendationReview | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [status, setStatus] = useState<ReviewStatus>(review.status);
  const [note, setNote] = useState(review.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function commit(deleting: boolean) {
    setBusy(true);
    setError("");
    try {
      await api(`/farms/${farmId}/recommendation/reviews/${review.id}`,
        deleting ? undefined : { status, note }, 15000, deleting ? "DELETE" : "PATCH");
      onChanged(review.id, deleting ? null : { ...review, status, note });
      setMode("view");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="review-history-item" aria-busy={busy}>
      <div className="review-history-heading">
        <div>
          <strong>{t(review.status)}</strong>
          <small>{new Date(review.created_at).toLocaleString(i18n.language)} · {review.reviewer_name || t("agronomist")}</small>
        </div>
        {review.can_manage && mode === "view" && <div className="review-history-actions">
          <button type="button" onClick={() => { setStatus(review.status); setNote(review.note); setError(""); setMode("edit"); }}><Pencil size={15} />{t("editReview")}</button>
          <button type="button" className="review-delete" onClick={() => { setError(""); setMode("delete"); }}><Trash2 size={15} />{t("deleteReview")}</button>
        </div>}
      </div>
      {mode !== "edit" && review.note && <p className="review-history-note">{review.note}</p>}
      {mode === "edit" && <form className="review-history-form" onSubmit={(e) => { e.preventDefault(); void commit(false); }}>
        <label>{t("reviewDecision")}
          <select autoFocus value={status} disabled={busy} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
            {REVIEW_STATUSES.map((value) => <option key={value} value={value}>{t(value)}</option>)}
          </select>
        </label>
        <label>{t("reviewNote")}
          <textarea value={note} maxLength={500} disabled={busy} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="review-history-actions">
          <button type="submit" className="primary" disabled={busy}>{t(busy ? "loading" : "save")}</button>
          <button type="button" disabled={busy} onClick={() => { setMode("view"); setError(""); }}>{t("cancelReviewAction")}</button>
        </div>
      </form>}
      {mode === "delete" && <div className="review-delete-confirm">
        <p>{t("deleteReviewConfirm")}</p>
        <div className="review-history-actions">
          <button type="button" autoFocus disabled={busy} onClick={() => { setMode("view"); setError(""); }}>{t("cancelReviewAction")}</button>
          <button type="button" className="review-delete" disabled={busy} onClick={() => void commit(true)}>{t(busy ? "loading" : "deleteReview")}</button>
        </div>
      </div>}
      {error && <p className="notice warning" role="alert">{t(error, { defaultValue: t("error") })}</p>}
    </article>
  );
}

function ReviewPanel({
  farm,
  onSaved,
}: {
  farm: AgronomistFarm;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReviewStatus>(
    farm.review?.status ?? "validated",
  );
  const [note, setNote] = useState(farm.review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api(`/farms/${farm.id}/recommendation/review`, { status, note });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-panel">
      <div className="review-actions">
        {REVIEW_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            className={status === value ? "selected" : ""}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {t(value)}
          </button>
        ))}
      </div>
      <label>
        {t("reviewNote")}
        <textarea
          value={note}
          maxLength={500}
          placeholder={t("reviewNotePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="notice warning">
          {t(error, { defaultValue: t("error") })}
        </p>
      )}
      {saved && <p className="success">{t("reviewSaved")}</p>}
      <button className="primary" type="button" disabled={busy} onClick={submit}>
        <ClipboardCheck size={16} />
        {t(busy ? "loading" : "reviewStatus")}
      </button>
    </div>
  );
}

export default function AgronomistDashboardView() {
  const { t } = useTranslation();
  const [data, setData] = useState<AgronomistDashboard | null>(null);
  const [farmerId, setFarmerId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (selectedFarmerId?: number) => {
    setBusy(true);
    setError("");
    try {
      const query = selectedFarmerId ? `?farmer_id=${selectedFarmerId}` : "";
      setData(await api<AgronomistDashboard>(`/agronomist/dashboard${query}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (data?.farmers.length && !farmerId) setFarmerId(data.farmers[0].id);
  }, [data, farmerId]);
  useEffect(() => {
    if (farmerId) load(farmerId);
  }, [farmerId, load]);

  if (busy && !data) {
    return (
      <Panel title={t("agronomist")}>
        <p role="status">{t("loading")}</p>
      </Panel>
    );
  }
  if (error && !data) {
    return (
      <Panel title={t("agronomist")}>
        <p role="alert" className="notice warning">
          {t(error, { defaultValue: t("error") })}
        </p>
        <button onClick={() => load()}>{t("retry")}</button>
      </Panel>
    );
  }
  const farmers = data?.farmers ?? [];
  const selectedRecord = data?.selected_farmer?.id === farmerId;
  const farms = selectedRecord ? data?.farms ?? [] : [];
  if (!farmers.length) {
    return (
      <Panel title={t("agronomist")}>
        <p>{t("noAssignedFarmers")}</p>
        <p className="caption">{t("assignedFarmersHelp")}</p>
      </Panel>
    );
  }
  return (
    <div className="agronomist-dashboard" aria-busy={busy}>
      <header className="agronomist-heading">
        <span className="agronomist-heading-icon"><ClipboardCheck size={26} /></span>
        <div>
          <h1>{t("agronomist")}</h1>
          <p>{t("assignedFarmersHelp")}</p>
        </div>
      </header>
      <Panel title={t("assignedFarmers")} className="agronomist-caseload">
        <label htmlFor="agronomist-farmer-select">{t("selectFarmer")}</label>
        <select id="agronomist-farmer-select" value={farmerId} onChange={(e) => setFarmerId(e.target.value ? Number(e.target.value) : "")}>
          <option value="" disabled>{t("selectFarmerPlaceholder")}</option>
          {farmers.map((farmer) => <option value={farmer.id} key={farmer.id}>{farmer.name} · {farmer.email}</option>)}
        </select>
        {farmerId && !selectedRecord && <p role="status">{t("loading")}</p>}
      </Panel>
      {selectedRecord && !farms.length && <Panel title={t("farms")}><p>{t("noFarmerFarms")}</p></Panel>}
      <p className="notice agronomist-estimate-note">{t("consultingEstimateNotice")}</p>
      {farms.map((farm) => {
        const sensors: [Icon, string, number, string][] = [
          [Droplets, "soilMoisture", farm.sensors.soil_moisture_pct, "%"],
          [Thermometer, "temperatureLabel", farm.sensors.temperature_c, "°C"],
          [Waves, "humidity", farm.sensors.humidity_pct, "%"],
          [Sprout, "et0", farm.sensors.et0_mm, "mm"],
          [Gauge, "rain", farm.sensors.rain_mm, "mm"],
        ];
        return (
          <Panel
            key={farm.id}
            className="agronomist-farm"
            title={farm.name}
            aside={<span className="badge">{farm.region.name}</span>}
          >
            <p className="caption">{t("farmerLabel")}: {farm.farmer_name || t("unassigned")}</p>
            <div className="dashboard-sensors">
              {sensors.map(([SensorIcon, key, value, unit]) => {
                const I = SensorIcon as typeof Sprout;
                return (
                  <div className="dashboard-sensor" key={key}>
                    <I size={17} />
                    <small>{t(key)}</small>
                    <strong>
                      {Number(value).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}{" "}
                      {unit}
                    </strong>
                  </div>
                );
              })}
            </div>
            <div className="dashboard-grid">
              <Panel title={t("conditionAnalysis")}>
                <dl className="readings">
                  <div>
                    <dt>{t("waterStress")}</dt>
                    <dd>{farm.analysis.stress} %</dd>
                  </div>
                  <div>
                    <dt>{t("heatRisk")}</dt>
                    <dd>{farm.analysis.heat_risk} %</dd>
                  </div>
                  <div>
                    <dt>{t("droughtRisk")}</dt>
                    <dd>{farm.analysis.drought_risk} %</dd>
                  </div>
                </dl>
              </Panel>
              <Panel title={t("aiRecommendation")}>
                <p className="notice">{t(farm.recommendation.action)}</p>
                <dl className="readings">
                  <div>
                    <dt>{t("waterDemand")}</dt>
                    <dd>{farm.recommendation.water_m3} m³</dd>
                  </div>
                  <div>
                    <dt>{t("net")}</dt>
                    <dd>{farm.recommendation.net_mm} mm</dd>
                  </div>
                  <div>
                    <dt>{t("gross")}</dt>
                    <dd>{farm.recommendation.gross_mm} mm</dd>
                  </div>
                </dl>
                <ReviewPanel farm={farm} onSaved={() => load(farmerId || undefined)} />
              </Panel>
            </div>
            <Panel title={t("reviewHistory")}>
              {farm.reviews.length ? <div className="review-history-list">{farm.reviews.map((review) => (
                <ReviewHistoryItem key={review.id} farmId={farm.id} review={review} onChanged={(id, updated) => {
                  setData((current) => current && ({ ...current, farms: current.farms.map((entry) => {
                    if (entry.id !== farm.id) return entry;
                    const reviews = entry.reviews.flatMap((item) => item.id === id ? (updated ? [updated] : []) : [item]);
                    return { ...entry, reviews, review: reviews[0] ?? null };
                  }) }));
                }} />
              ))}</div> : <p>{t("noReviewHistory")}</p>}
            </Panel>
            <Panel title={t("fieldReadings")}>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {["name", "crop", "area", "soilMoisture"].map((k) => (
                        <th key={k}>{t(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {farm.fields.map((field) => (
                      <tr key={field.id}>
                        <td>{field.name}</td>
                        <td>{t(field.crop)}</td>
                        <td>{field.area_ha} ha</td>
                        <td>{field.moisture_pct} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title={t("irrigationHistory")}>
              <div className="weather-stats">
                <div>
                  <small>{t("todayWater")}</small>
                  <strong>{farm.stats.water_m3_day} m³</strong>
                </div>
                <div>
                  <small>{t("waterUse7d")}</small>
                  <strong>{farm.stats.water_m3_7d} m³</strong>
                </div>
                <div>
                  <small>{t("pumpEnergy7d")}</small>
                  <strong>{farm.stats.pump_kwh_7d} kWh</strong>
                </div>
                <div>
                  <small>{t("solarYield7d")}</small>
                  <strong>{farm.stats.solar_kwh_7d} kWh</strong>
                </div>
              </div>
            </Panel>
          </Panel>
        );
      })}
    </div>
  );
}
