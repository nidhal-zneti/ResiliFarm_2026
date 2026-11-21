import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Droplets, Sun, Zap, Sprout, ArrowUpRight } from "lucide-react";
import type { Calculation, Farm, FarmDraft, Weather, Network } from "./types";

export function Panel({
  title,
  children,
  className = "",
  aside,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metrics({ data }: { data: Calculation }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="metrics">
      {[
        [Droplets, "waterDemand", data.water_m3, "m³"],
        [Sun, "solarYield", data.solar_kwh, "kWh"],
        [Zap, "pumpEnergy", data.pump_kwh, "kWh"],
        [Sprout, "waterStress", data.stress, "%"],
      ].map(([Icon, key, value, unit], i) => {
        const I = Icon as typeof Droplets;
        return (
          <div className={"metric tone-" + i} key={String(key)}>
            <div className="metric-label">
              <span>{t(String(key))}</span>
              <I size={19} />
            </div>
            <div className="metric-value">
              {Number(value).toLocaleString(i18n.language, {
                maximumFractionDigits: 1,
              })}
              <small>{String(unit)}</small>
            </div>
            <span className="metric-foot">
              {t(i === 3 ? "estimated" : "daily")} <ArrowUpRight size={13} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
export function WeatherChart({ weather }: { weather: Weather }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="chart" role="img" aria-label={t("waterBalance")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={weather.days}
            margin={{ top: 10, right: 10, bottom: 0, left: -25 }}
          >
            <defs>
              <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#288066" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#288066" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="#dce4df"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(s) => s.slice(5)}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              unit=" mm"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip />
            <Legend />
            <Area
              name={t("et0")}
              type="monotone"
              dataKey="et0_mm"
              stroke="#167255"
              strokeWidth={2.5}
              fill="url(#greenFill)"
              isAnimationActive={false}
            />
            <Area
              name={t("rain")}
              type="monotone"
              dataKey="rain_mm"
              stroke="#3c78a6"
              strokeDasharray="5 4"
              strokeWidth={2}
              fill="transparent"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>{t("forecastDays")}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["date", "et0", "rain", "temperatureLabel"].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weather.days.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.et0_mm} mm</td>
                  <td>{d.rain_mm} mm</td>
                  <td>{d.temperature_c} °C</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function FarmForm({
  value,
  onChange,
  onSubmit,
  busy,
  compact = false,
}: {
  value: FarmDraft;
  onChange: (v: FarmDraft) => void;
  onSubmit: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const nums: [keyof Omit<Farm, "region_id">, string, number, number, number][] = [
    ["area_ha", "area", 0.01, 10000, 0.01],
    ["efficiency", "efficiency", 0.1, 1, 0.01],
    ["et0", "et0", 0, 30, 0.01],
    ["rainfall", "rain", 0, 500, 0.1],
    ["head_m", "head", 0, 500, 1],
    ["pump_efficiency", "pumpEfficiency", 0.1, 1, 0.01],
    ["solar_kw", "solarSize", 0, 10000, 0.1],
    ["sun_hours", "sunHours", 0, 24, 0.1],
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={"form-grid " + (compact ? "compact" : "")}>
        <label>
          {t("crop")}
          <select
            required
            value={value.crop ?? ""}
            onChange={(e) => onChange({ ...value, crop: e.target.value })}
          >
            <option value="" disabled>—</option>
            {["olive", "wheat", "tomato"].map((k) => (
              <option key={k} value={k}>
                {t(k)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("stage")}
          <select
            required
            value={value.stage ?? ""}
            onChange={(e) => onChange({ ...value, stage: e.target.value })}
          >
            <option value="" disabled>—</option>
            {["initial", "mid", "late"].map((k) => (
              <option key={k} value={k}>
                {t(k)}
              </option>
            ))}
          </select>
        </label>
        {nums.map(([key, label, min, max, step]) => (
          <label key={key}>
            {t(label)}
            <input
              required
              type="number"
              min={min}
              max={max}
              step={step}
              value={value[key] ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </label>
        ))}
      </div>
      <button className="primary" disabled={busy} type="submit">
        <Droplets size={16} />
        {t(busy ? "loading" : "calculate")}
      </button>
    </form>
  );
}
export function NetworkView({ data }: { data: Network }) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className="network"
        role="img"
        aria-label={`${t("network")}: ${data.flow_lpm} L/min, ${data.pressure_bar} bar`}
      >
        <div>
          <Droplets />
          <strong>{t("reservoir")}</strong>
          <small>{data.inlet_m3} m³</small>
        </div>
        <span className="pipe" />
        <div>
          <Zap />
          <strong>{t("pump")}</strong>
          <small>{data.flow_lpm} L/min</small>
        </div>
        <span className={"pipe " + (data.lost_m3 > 0 ? "leaking" : "")} />
        <div>
          <Sprout />
          <strong>{t("field")}</strong>
          <small>{data.pressure_bar} bar</small>
        </div>
      </div>
      <p className="caption">{t("darcy")}</p>
      {data.alert !== "normal" && (
        <p className="notice warning">{t(data.alert)}</p>
      )}
    </>
  );
}
