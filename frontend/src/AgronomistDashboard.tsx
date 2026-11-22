import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardCheck,
  Droplets,
  Gauge,
  Sprout,
  Thermometer,
  Waves,
} from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type { AgronomistDashboard, AgronomistFarm } from "./types";

const REVIEW_STATUSES = ["validated", "rejected", "modified"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];
type Icon = typeof Sprout;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api<AgronomistDashboard>("/agronomist/dashboard"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        <button onClick={load}>{t("retry")}</button>
      </Panel>
    );
  }
  const farms = data?.farms ?? [];
  if (!farms.length) {
    return (
      <Panel title={t("agronomist")}>
        <p>{t("noAssignedFarms")}</p>
        <p className="caption">{t("assignedFarmsHelp")}</p>
      </Panel>
    );
  }
  return (
    <>
      <p className="notice">{t("assignedFarmsHelp")}</p>
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
            title={farm.name}
            aside={<span className="badge">{farm.region.name}</span>}
          >
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
                <ReviewPanel farm={farm} onSaved={load} />
              </Panel>
            </div>
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
    </>
  );
}
