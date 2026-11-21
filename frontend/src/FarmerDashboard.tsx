import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CloudRain,
  Droplets,
  Gauge,
  Sprout,
  Thermometer,
  Wind,
} from "lucide-react";
import { Panel, WeatherChart } from "./components";
import type { Calculation, Region, Weather } from "./types";

type Icon = typeof Sprout;

export default function FarmerDashboard({
  region,
  weather,
  calc,
  onNavigate,
}: {
  region?: Region;
  weather: Weather | null;
  calc: Calculation | null;
  onNavigate: (page: string) => void;
}) {
  const { t } = useTranslation();
  if (!weather) {
    return (
      <Panel title={t("currentWeather")}>
        <p role="status">{t("weatherUnavailable")}</p>
      </Panel>
    );
  }
  const current = weather.current;
  const today = weather.days[0];
  const tiles: [Icon, string, string][] = [
    [Thermometer, "temperatureLabel", `${current.temperature_2m} °C`],
    [Droplets, "humidity", `${current.relative_humidity_2m} %`],
    [CloudRain, "rain", `${current.precipitation} mm`],
    [Wind, "wind", `${current.wind_speed_10m} km/h`],
  ];
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">
            {t("farmer")} / {region?.name.toUpperCase()}
          </span>
          <h1>{t("farmerTitle")}</h1>
          <p>{t("farmerIntro")}</p>
        </div>
        <button className="primary" onClick={() => onNavigate("agriculture")}>
          <Sprout size={17} />
          {t("startIrrigation")}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="dashboard-sensors">
        {tiles.map(([TileIcon, key, value]) => {
          const I = TileIcon as typeof Sprout;
          return (
            <div className="dashboard-sensor" key={key}>
              <I size={17} />
              <small>{t(key)}</small>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>
      <Panel
        title={t("forecast")}
        aside={<span className="badge">{t("modelWeather")}</span>}
      >
        <WeatherChart weather={weather} />
        <p className="caption">
          {weather.source} · {t("weatherValidAt")}: {weather.updated_at}
        </p>
      </Panel>
      <div className="dashboard-grid">
        <Panel title={t("irrigationNeed")}>
          {calc ? (
            <>
              <div className="weather-stats">
                <div>
                  <small>{t("waterDemand")}</small>
                  <strong>{calc.water_m3} m³</strong>
                </div>
                <div>
                  <small>{t("net")}</small>
                  <strong>{calc.net_mm} mm</strong>
                </div>
                <div>
                  <small>{t("waterStress")}</small>
                  <strong>{calc.stress} %</strong>
                </div>
              </div>
              <p className="notice">{t(calc.action)}</p>
            </>
          ) : (
            <>
              <p>{t("noIrrigationYet")}</p>
              <button onClick={() => onNavigate("agriculture")}>
                <Sprout size={16} />
                {t("openAgriculture")}
              </button>
            </>
          )}
        </Panel>
        <Panel title={t("fieldStatus")}>
          <dl className="readings">
            <div>
              <dt>{t("region")}</dt>
              <dd>{region?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("climate")}</dt>
              <dd>{t(region?.climate ?? "")}</dd>
            </div>
            {today && (
              <>
                <div>
                  <dt>{t("et0")}</dt>
                  <dd>{today.et0_mm} mm</dd>
                </div>
                <div>
                  <dt>{t("rain")}</dt>
                  <dd>{today.rain_mm} mm</dd>
                </div>
              </>
            )}
          </dl>
          <p className="caption">
            <Gauge size={13} /> {t("farmerScopeNote")}
          </p>
        </Panel>
      </div>
    </>
  );
}
