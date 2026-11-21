import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polyline,
} from "react-leaflet";
import {
  Leaf,
  LayoutDashboard,
  Map,
  MapPinned,
  Sprout,
  Droplets,
  Sun,
  FlaskConical,
  Sparkles,
  ShieldCheck,
  CircuitBoard,
  Settings,
  ArrowUpRight,
  ChevronRight,
  Menu,
  ArrowRight,
  Activity,
  Download,
  Home,
} from "lucide-react";
import { api, download } from "./api";
import {
  Panel,
  Metrics,
  WeatherChart,
  FarmForm,
  NetworkView,
} from "./components";
import Studio from "./Studio";
import { ExperienceMode, SectionGuide, StartHere } from "./Guide";
import MapControls from "./MapControls";
import type {
  Region,
  Overview,
  Farm,
  Calculation,
  Scenario,
  Weather,
} from "./types";

const pages = [
  ["home", Home],
  ["overview", LayoutDashboard],
  ["comparison", MapPinned],
  ["twin", Map],
  ["agriculture", Sprout],
  ["water", Droplets],
  ["energy", Sun],
  ["simulator", FlaskConical],
  ["insights", Sparkles],
  ["security", ShieldCheck],
  ["studio", CircuitBoard],
  ["settings", Settings],
] as const;
const knownPages = new Set(pages.map(([key]) => key));
function initialPage() {
  const hash = location.hash.slice(1);
  return knownPages.has(hash as (typeof pages)[number][0]) ? hash : "home";
}
const initial: Farm = {
  region_id: 1,
  crop: "olive",
  stage: "mid",
  area_ha: 5,
  efficiency: 0.85,
  et0: 5.8,
  rainfall: 0.2,
  head_m: 30,
  pump_efficiency: 0.65,
  solar_kw: 12,
  sun_hours: 5.5,
};
const scenarios = [
  "drought",
  "heatwave",
  "restriction",
  "leak",
  "pumpFailure",
  "solarShortage",
  "tampering",
];

export default function App() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(initialPage);
  const [menu, setMenu] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [country, setCountry] = useState(1);
  const [rid, setRid] = useState(1);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [farm, setFarm] = useState<Farm>(initial);
  const [calculatedFarm, setCalculatedFarm] = useState<Farm>(initial);
  const [allocation, setAllocation] = useState(250);
  const [calc, setCalc] = useState<Calculation | null>(null);
  const [comparison, setComparison] = useState<Overview[]>([]);
  const [selectedField, setSelectedField] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState("leak");
  const [severity, setSeverity] = useState(0.35);
  const [intervention, setIntervention] = useState(false);
  const [sim, setSim] = useState<Scenario | null>(null);
  const [roof, setRoof] = useState(400);
  const [storage, setStorage] = useState(50);
  const [securityMode, setSecurityMode] = useState("leak");
  const [securityResult, setSecurityResult] = useState<{
    alerts: { code: string; evidence: Record<string, number> }[];
  } | null>(null);
  const [alerts, setAlerts] = useState<
    { id: number; payload: { code: string }; created_at: string }[]
  >([]);
  const [contrast, setContrast] = useState(
    localStorage.getItem("rf-contrast") === "true",
  );
  const [font, setFont] = useState(
    Number(localStorage.getItem("rf-font") || 100),
  );
  const [motion, setMotion] = useState(
    localStorage.getItem("rf-motion") === "true",
  );
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<ExperienceMode>(() =>
    localStorage.getItem("rf-mode") === "professional"
      ? "professional"
      : "beginner",
  );
  const navigate = (p: string) => {
    location.hash = p;
    setPage(p);
    setMenu(false);
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const handler = () => {
      const hash = location.hash.slice(1);
      setPage(
        knownPages.has(hash as (typeof pages)[number][0]) ? hash : "home",
      );
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    localStorage.setItem("rf-mode", mode);
  }, [mode]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    localStorage.setItem("rf-language", i18n.language);
  }, [i18n.language]);
  useEffect(() => {
    document.documentElement.dataset.contrast = String(contrast);
    document.documentElement.dataset.motion = String(motion);
    document.documentElement.style.fontSize = font + "%";
    localStorage.setItem("rf-contrast", String(contrast));
    localStorage.setItem("rf-font", String(font));
    localStorage.setItem("rf-motion", String(motion));
  }, [contrast, font, motion]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const load = useCallback(async () => {
    await act(async () => {
      const [r, o] = await Promise.all([
        api<{ regions: Region[] }>("/regions"),
        api<Overview>(`/regions/${rid}/overview`),
      ]);
      setRegions(r.regions);
      setOverview(o);
      setWeather(o.weather);
      setCalc(o.calculation);
      const loadedFarm = {
        ...initial,
        region_id: rid,
        et0: o.weather.days.at(-1)!.et0_mm,
        rainfall: o.weather.days.at(-1)!.rain_mm,
      };
      setFarm(loadedFarm);
      setCalculatedFarm(loadedFarm);
      setSelectedField(0);
      setSim(null);
      setSecurityResult(null);
      setAlerts(await api(`/alerts?region_id=${rid}`));
    });
  }, [rid]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (page === "comparison" && regions.length)
      act(async () =>
        setComparison(
          await Promise.all(
            regions
              .filter((r) => r.country_id === country)
              .map((r) => api<Overview>(`/regions/${r.id}/overview`)),
          ),
        ),
      );
  }, [page, country, regions]);
  const calculate = () =>
    act(async () => {
      const result = await api<Calculation>(
        "/recommendations/irrigation",
        farm,
      );
      setCalc(result);
      setCalculatedFarm({ ...farm });
      const n = await api<Overview["network"]>(
        `/regions/${rid}/water-network?volume=${result.water_m3}`,
      );
      setOverview((o) => (o ? { ...o, network: n } : o));
    });
  const selectedRegion = regions.find((r) => r.id === rid);
  const day = weather?.days.at(-1);
  const field = overview?.fields[selectedField];
  const sectionTitle = pages.some(([p]) => p === page)
    ? t(page)
    : t("overview");
  const showHeader =
    page !== "home" && page !== "overview" && page !== "studio";
  const analyze = () =>
    act(async () => {
      const mode = securityMode;
      setSecurityResult(
        await api("/security/analyze", {
          flow: [40, 41, 39, 40, 41, mode === "leak" ? 68 : 40],
          pressure: [3, 3.1, 3, 3.05, 3, mode === "leak" ? 1.8 : 3],
          moisture:
            mode === "sensorFrozen"
              ? [30, 30, 30, 30, 30, 30]
              : [
                  31,
                  32,
                  31,
                  32,
                  30,
                  mode === "tampering" ? 140 : mode === "sensorJump" ? 70 : 31,
                ],
        }),
      );
    });
  return (
    <div className="app">
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {t("skip")}
      </a>
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a className="brand" href="#home" onClick={() => navigate("home")}>
          <span className="brand-icon">
            <Leaf size={26} />
          </span>
          <span>
            ResiliFarm<span className="brand-ai">AI</span>
            <small>{t("tagline")}</small>
          </span>
        </a>
        <div className="workspace-label">{t("workspace")}</div>
        <nav aria-label={t("workspace")}>
          {pages.map(([key, Icon], i) => (
            <div key={key}>
              {i === 6 && (
                <div className="workspace-label">{t("engineering")}</div>
              )}
              <button
                aria-current={page === key ? "page" : undefined}
                onClick={() => navigate(key)}
                className={page === key ? "active" : ""}
              >
                <Icon size={18} />
                <span>{t(key)}</span>
                {key === "studio" && <span className="new-dot" />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="team-avatar">BB</div>
          <div>
            <strong>Besbes Bobi</strong>
            <small>KIZUNA 2026 · ESPRIT</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={t("menu")}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>ResiliFarm AI</span>
            <ChevronRight size={14} />
            <strong>{sectionTitle}</strong>
          </div>
          <div className="top-actions">
            <div
              className="experience-switch"
              role="group"
              aria-label={t("experienceMode")}
            >
              <button
                aria-pressed={mode === "beginner"}
                className={mode === "beginner" ? "selected" : ""}
                onClick={() => setMode("beginner")}
              >
                {t("beginnerMode")}
              </button>
              <button
                aria-pressed={mode === "professional"}
                className={mode === "professional" ? "selected" : ""}
                onClick={() => setMode("professional")}
              >
                {t("professionalMode")}
              </button>
            </div>
            <span className="demo-pill">
              <i />
              {t("demo")}
            </span>
            <label className="sr-only" htmlFor="language">
              {t("language")}
            </label>
            <select
              id="language"
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
              <option value="ja">日本語</option>
            </select>
            <button
              className="avatar"
              onClick={() => navigate("settings")}
              aria-label={t("settings")}
            >
              BB
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="location-bar">
            <div>
              <MapPinned size={17} />
              <label>
                <span className="sr-only">{t("country")}</span>
                <select
                  value={country}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setCountry(id);
                    setRid(regions.find((r) => r.country_id === id)?.id || id);
                  }}
                >
                  <option value={1}>{t("Tunisia")}</option>
                  <option value={2}>{t("Japan")}</option>
                </select>
              </label>
              <span className="slash">/</span>
              <label>
                <span className="sr-only">{t("region")}</span>
                <select
                  value={rid}
                  onChange={(e) => setRid(Number(e.target.value))}
                >
                  {regions
                    .filter((r) => r.country_id === country)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <span className="caption">
              {selectedRegion && t(selectedRegion.climate)}
            </span>
          </div>
          {error && (
            <div role="alert" className="notice warning">
              {t(error, { defaultValue: t("error") })}
              <button onClick={load}>{t("retry")}</button>
            </div>
          )}
          {busy && (
            <div className="loading-bar" role="status">
              {t("loading")}
            </div>
          )}
          {showHeader && (
            <div className="section-intro">
              <div>
                <span className="eyebrow">{t("intelligence")}</span>
                <h1>{sectionTitle}</h1>
                <p>
                  {t(
                    page === "simulator"
                      ? "scenarioHelp"
                      : page === "security"
                        ? "securityText"
                        : page === "insights"
                          ? "insightsText"
                          : "sampleNote",
                  )}
                </p>
              </div>
            </div>
          )}
          {page === "home" && <StartHere mode={mode} onNavigate={navigate} />}
          {page !== "home" && <SectionGuide section={page} mode={mode} />}
          {page === "overview" && overview && calc && weather && (
            <>
              <div className="section-intro">
                <div>
                  <span className="eyebrow">
                    {t("workspace")} / {selectedRegion?.name.toUpperCase()}
                  </span>
                  <h1>{t("welcome")}</h1>
                  <p>{t("overviewSub")}</p>
                </div>
                <button className="primary" onClick={() => navigate("studio")}>
                  <CircuitBoard size={17} />
                  {t("openStudio")}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <Metrics data={calc} />
              <div className="overview-grid">
                <Panel
                  title={t("waterBalance")}
                  aside={<span className="badge">{t("simulated")}</span>}
                >
                  <WeatherChart weather={overview.weather} />
                </Panel>
                <Panel className="resilience-card">
                  <span className="eyebrow">{t("estimated")}</span>
                  <div className="leaf-orbit">
                    <Leaf size={52} strokeWidth={1.2} />
                  </div>
                  <h2>{t("recommendations")}</h2>
                  <p>{t(calc.action)}</p>
                  <button onClick={() => navigate("simulator")}>
                    {t("runScenario")}
                    <ArrowRight size={17} />
                  </button>
                </Panel>
              </div>
              <div className="two-col">
                <Panel
                  title={t("fieldStatus")}
                  aside={
                    <button
                      className="text-button"
                      onClick={() => navigate("twin")}
                    >
                      {t("twin")}
                      <ArrowUpRight size={15} />
                    </button>
                  }
                >
                  <div className="field-list">
                    {overview.fields.map((f, i) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setSelectedField(i);
                          navigate("twin");
                        }}
                      >
                        <span className={"field-tile field-" + i}>
                          <Sprout size={20} />
                        </span>
                        <span>
                          <strong>
                            {f.name} · {t(["olive", "wheat", "tomato"][i])}
                          </strong>
                          <small>
                            {f.area_ha} ha · {t("simulated")}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                </Panel>
                <Panel
                  title={t("network")}
                  aside={<span className="badge">{t("estimated")}</span>}
                >
                  <NetworkView data={overview.network} />
                </Panel>
              </div>
              <p className="caption provenance">{t("sampleNote")}</p>
            </>
          )}
          {page === "comparison" && (
            <>
              <p className="notice">{t("regionalNote")}</p>
              <div className="comparison-grid">
                {comparison.map((o) => (
                  <Panel
                    key={o.region.id}
                    title={o.region.name}
                    aside={<span className="badge">{t(o.region.climate)}</span>}
                  >
                    <Metrics data={o.calculation} />
                    <WeatherChart weather={o.weather} />
                    <button
                      onClick={() => {
                        setRid(o.region.id);
                        navigate("agriculture");
                      }}
                    >
                      {t("inspect")}
                      <ArrowRight size={16} />
                    </button>
                  </Panel>
                ))}
              </div>
            </>
          )}
          {page === "twin" && overview && selectedRegion && (
            <>
              <div className="twin-layout">
                <Panel className="map-panel">
                  <MapContainer
                    key={rid}
                    center={[
                      selectedRegion.lat + 0.008,
                      selectedRegion.lon + 0.01,
                    ]}
                    zoom={13}
                    zoomControl={false}
                    scrollWheelZoom={false}
                    style={{ height: 460, width: "100%" }}
                  >
                    <MapControls />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Polyline
                      positions={overview.fields.map((f) => [f.lat, f.lon])}
                      pathOptions={{
                        color: "#327ba3",
                        weight: 4,
                        dashArray: "8 6",
                      }}
                    />
                    {overview.fields.map((f, i) => (
                      <CircleMarker
                        key={f.id}
                        center={[f.lat, f.lon]}
                        radius={i === selectedField ? 20 : 13}
                        pathOptions={{
                          color: "#fff",
                          fillColor:
                            i === selectedField ? "#c87434" : "#21735a",
                          fillOpacity: 0.9,
                          weight: 3,
                        }}
                        eventHandlers={{ click: () => setSelectedField(i) }}
                      >
                        <Popup>
                          {f.name} · {t(["olive", "wheat", "tomato"][i])} ·{" "}
                          {f.area_ha} ha
                        </Popup>
                      </CircleMarker>
                    ))}
                    {overview.devices.map((d, i) => (
                      <CircleMarker
                        key={d.id}
                        center={[
                          selectedRegion.lat - 0.004 - i * 0.002,
                          selectedRegion.lon + 0.005,
                        ]}
                        radius={9}
                        pathOptions={{ color: "#7752a1", fillOpacity: 1 }}
                      >
                        <Popup>
                          {d.name} · {t("simulated")}
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                  <p className="caption">{t("mapNote")}</p>
                </Panel>
                <Panel title={t("activeField")}>
                  <div className="field-buttons">
                    {overview.fields.map((f, i) => (
                      <button
                        key={f.id}
                        className={selectedField === i ? "selected" : ""}
                        onClick={() => setSelectedField(i)}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                  {field && (
                    <>
                      <h2>
                        {field.name} ·{" "}
                        {t(["olive", "wheat", "tomato"][selectedField])}
                      </h2>
                      <dl className="readings">
                        <div>
                          <dt>{t("area")}</dt>
                          <dd>{field.area_ha} ha</dd>
                        </div>
                        <div>
                          <dt>{t("sensor")}</dt>
                          <dd>{[31, 38, 34][selectedField]} %</dd>
                        </div>
                        <div>
                          <dt>{t("pressureLabel")}</dt>
                          <dd>{overview.network.pressure_bar} bar</dd>
                        </div>
                        <div>
                          <dt>{t("solarYield")}</dt>
                          <dd>{overview.calculation.solar_kwh} kWh</dd>
                        </div>
                      </dl>
                      <span className="badge">{t("simulated")}</span>
                    </>
                  )}
                  <h3>{t("devices")}</h3>
                  {overview.devices.length ? (
                    overview.devices.map((d) => (
                      <p key={d.id}>
                        <CircuitBoard size={15} /> #{d.id} {d.name}
                      </p>
                    ))
                  ) : (
                    <p>{t("noDevices")}</p>
                  )}
                  <button onClick={() => navigate("studio")}>
                    {t("openStudio")}
                    <ArrowRight size={16} />
                  </button>
                  <p className="caption">{t("scenarioDevice")}</p>
                </Panel>
              </div>
            </>
          )}
          {["agriculture", "water", "energy"].includes(page) && calc && (
            <>
              <Panel title={t("calculate")}>
                <FarmForm
                  value={farm}
                  onChange={setFarm}
                  onSubmit={calculate}
                  busy={busy}
                />
              </Panel>
              <p className="caption">{t("inputNote")}</p>
              <Metrics data={calc} />
              {page === "agriculture" && (
                <div className="two-col">
                  <Panel title={t("result")}>
                    <dl className="readings">
                      {[
                        ["Kc", calc.kc, ""],
                        ["ETc", calc.etc_mm, "mm"],
                        ["effectiveRain", calc.effective_rain_mm, "mm"],
                        ["net", calc.net_mm, "mm"],
                        ["gross", calc.gross_mm, "mm"],
                      ].map(([k, v, u]) => (
                        <div key={k}>
                          <dt>{t(String(k))}</dt>
                          <dd>
                            {v} {u}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="caption">{t("formula")}</p>
                    <p className="caption">{t("riskNote")}</p>
                    <button
                      onClick={() =>
                        download(
                          "resilifarm-calculation.json",
                          JSON.stringify(
                            {
                              input: calculatedFarm,
                              result: calc,
                              source:
                                "Engineering estimate from user-supplied inputs",
                            },
                            null,
                            2,
                          ),
                        )
                      }
                    >
                      <Download size={16} />
                      {t("exportReport")}
                    </button>
                  </Panel>
                  <Panel title={t("recommendations")}>
                    <p className="notice">{t(calc.action)}</p>
                    <p>{t("fao56")}</p>
                    {weather && <WeatherChart weather={weather} />}
                  </Panel>
                </div>
              )}
              {page === "water" && overview && (
                <div className="two-col">
                  <Panel title={t("network")}>
                    <NetworkView
                      data={
                        sim?.scenario === "leak" ? sim.after : overview.network
                      }
                    />
                    <p>{t("networkHelp")}</p>
                    <label>
                      {t("dailyAllocation")}
                      <input
                        type="number"
                        min="0"
                        value={allocation}
                        onChange={(e) =>
                          setAllocation(Math.max(0, Number(e.target.value)))
                        }
                      />
                    </label>
                    <p>
                      {t("allocationGap")}:{" "}
                      <strong>
                        {Math.max(0, calc.water_m3 - allocation).toFixed(2)} m³
                      </strong>
                    </p>
                    <button
                      onClick={() => {
                        setScenario("leak");
                        navigate("simulator");
                      }}
                    >
                      {t("leak")}
                      <ArrowRight size={16} />
                    </button>
                  </Panel>
                  <Panel title={t("harvesting")}>
                    <div className="form-grid">
                      <label>
                        {t("roof")}
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          value={roof}
                          onChange={(e) =>
                            setRoof(Math.max(0, Number(e.target.value)))
                          }
                        />
                      </label>
                      <label>
                        {t("storage")}
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          value={storage}
                          onChange={(e) =>
                            setStorage(Math.max(0, Number(e.target.value)))
                          }
                        />
                      </label>
                    </div>
                    <div className="big-number">
                      {Math.min(
                        storage,
                        (farm.rainfall * roof * 0.8) / 1000,
                      ).toFixed(2)}{" "}
                      <small>m³</small>
                    </div>
                    <p>{t("harvestEstimate")}</p>
                    <p className="caption">{t("estimated")}</p>
                  </Panel>
                </div>
              )}
              {page === "energy" && (
                <div className="two-col">
                  <Panel title={t("energy")}>
                    <div className="energy-bars">
                      {[
                        ["solarYield", calc.solar_kwh],
                        ["pumpEnergy", calc.pump_kwh],
                        ["deficit", calc.deficit_kwh],
                      ].map(([key, value]) => (
                        <div key={key}>
                          <span>{t(String(key))}</span>
                          <strong>{value} kWh</strong>
                          <meter
                            min={0}
                            max={Math.max(calc.solar_kwh, calc.pump_kwh, 1)}
                            value={Number(value)}
                            aria-label={t(String(key))}
                          />
                        </div>
                      ))}
                    </div>
                    <p>{t("solarMethod")}</p>
                  </Panel>
                  <Panel title={t("recommendations")}>
                    <Sun size={40} className="orange" />
                    <h2>10:00 — 15:00</h2>
                    <p>{t(calc.action)}</p>
                    <p className="caption">{t("estimated")}</p>
                  </Panel>
                </div>
              )}
            </>
          )}
          {page === "simulator" && (
            <>
              <Panel title={t("scenario")}>
                <div className="scenario-options">
                  {scenarios.map((k) => (
                    <button
                      aria-pressed={scenario === k}
                      className={scenario === k ? "selected" : ""}
                      key={k}
                      onClick={() => setScenario(k)}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
                <div className="simulation-controls">
                  <label>
                    {t("severity")} · {Math.round(severity * 100)}%
                    <input
                      type="range"
                      min=".05"
                      max=".9"
                      step=".05"
                      value={severity}
                      onChange={(e) => setSeverity(Number(e.target.value))}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={intervention}
                      onChange={(e) => setIntervention(e.target.checked)}
                    />
                    {t("intervention")}
                  </label>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        setSim(
                          await api<Scenario>("/simulations/scenario", {
                            ...farm,
                            scenario,
                            severity,
                            intervention,
                          }),
                        );
                        setAlerts(await api(`/alerts?region_id=${rid}`));
                      })
                    }
                  >
                    <FlaskConical size={17} />
                    {t("run")}
                  </button>
                </div>
                <details>
                  <summary>{t("calculate")}</summary>
                  <FarmForm
                    value={farm}
                    onChange={setFarm}
                    onSubmit={calculate}
                    busy={busy}
                  />
                </details>
              </Panel>
              {sim ? (
                <>
                  <div className="notice">
                    <Sparkles size={20} />
                    <div>
                      <strong>{t(sim.action)}</strong>
                      <p className="caption">
                        {t("savedRun")} #{sim.id} · {t(sim.scenario)} ·{" "}
                        {Math.round(sim.severity * 100)}%
                      </p>
                    </div>
                  </div>
                  <div className="scenario-results">
                    {(["before", "disturbed", "after"] as const).map((key) => (
                      <Panel key={key} title={t(key)}>
                        <Metrics data={sim[key]} />
                        {key !== "before" && (
                          <dl className="readings">
                            <div>
                              <dt>{t("loss")}</dt>
                              <dd>{sim[key].lost_m3} m³</dd>
                            </div>
                            <div>
                              <dt>{t("delivered")}</dt>
                              <dd>{sim[key].delivered_m3} m³</dd>
                            </div>
                            <div>
                              <dt>{t("unmet")}</dt>
                              <dd>{sim[key].unmet_m3} m³</dd>
                            </div>
                            <div>
                              <dt>{t("priority")}</dt>
                              <dd>{sim[key].priority_coverage_pct}%</dd>
                            </div>
                            <div>
                              <dt>{t("backupSupply")}</dt>
                              <dd>{sim[key].backup_kwh} kWh</dd>
                            </div>
                            <div>
                              <dt>{t("remainingDeficit")}</dt>
                              <dd>{sim[key].remaining_deficit_kwh} kWh</dd>
                            </div>
                          </dl>
                        )}
                      </Panel>
                    ))}
                  </div>
                  <p className="caption">{t("scenarioAssumptions")}</p>
                  {sim.telemetry && (
                    <Panel title={t("telemetry")}>
                      <p>
                        {t("before")}: {sim.telemetry.before_moisture_pct}% ·{" "}
                        {t("disturbed")}: {sim.telemetry.disturbed_moisture_pct}
                        % · {t("after")}: {sim.telemetry.after_moisture_pct}%
                      </p>
                    </Panel>
                  )}
                  {sim.scenario === "tampering" && (
                    <button
                      onClick={() => {
                        setSecurityMode("tampering");
                        navigate("security");
                      }}
                    >
                      {t("analyze")}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </>
              ) : (
                <p className="empty-state">{t("noResult")}</p>
              )}
            </>
          )}
          {page === "insights" && calc && (
            <>
              <div className="notice">
                <Sparkles size={20} />
                {t("rules")}
              </div>
              <Metrics data={calc} />
              <div className="two-col">
                <Panel title={t("recommendations")}>
                  {[
                    calc.action,
                    calc.stress > 30 ? "mulch" : "coolHours",
                    "verifySensor",
                  ].map((k) => (
                    <div className="insight-row" key={k}>
                      <span>
                        <Sparkles size={19} />
                      </span>
                      <p>{t(k)}</p>
                    </div>
                  ))}
                </Panel>
                <Panel title={t("method")}>
                  <h3>ETc = Kc × ET₀</h3>
                  <p>{t("formula")}</p>
                  <p>{t("solarMethod")}</p>
                  <p>{t("riskNote")}</p>
                </Panel>
              </div>
            </>
          )}
          {page === "security" && (
            <>
              <Panel title={t("analyze")}>
                <div className="scenario-options">
                  {[
                    "normal",
                    "leak",
                    "tampering",
                    "sensorFrozen",
                    "sensorJump",
                  ].map((k) => (
                    <button
                      key={k}
                      className={securityMode === k ? "selected" : ""}
                      onClick={() => {
                        setSecurityMode(k);
                        setSecurityResult(null);
                      }}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
                <button className="primary" disabled={busy} onClick={analyze}>
                  <ShieldCheck size={17} />
                  {t("analyze")}
                </button>
              </Panel>
              {securityResult && (
                <Panel title={t("result")}>
                  {securityResult.alerts.length ? (
                    securityResult.alerts.map((a) => (
                      <div className="notice warning" key={a.code}>
                        <ShieldCheck size={24} />
                        <div>
                          <strong>{t(a.code)}</strong>
                          <p>
                            {t("evidence")}:{" "}
                            {Object.entries(a.evidence)
                              .map(([k, v]) => `${t(k)}: ${v}`)
                              .join(" · ")}
                          </p>
                          <p>{t("verifySensor")}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="success">{t("noAlerts")}</p>
                  )}
                </Panel>
              )}
              <Panel title={t("alertLog")}>
                {alerts.length ? (
                  alerts.map((a) => (
                    <p key={a.id}>
                      <span className="badge">{t("simulated")}</span>{" "}
                      {t(a.payload.code)}{" "}
                      <small>
                        {new Date(a.created_at).toLocaleString(i18n.language)}
                      </small>
                    </p>
                  ))
                ) : (
                  <p>{t("noSavedAlerts")}</p>
                )}
              </Panel>
            </>
          )}
          {page === "studio" && (
            <Studio
              region={rid}
              onDeploy={() =>
                api<Overview>(`/regions/${rid}/overview`)
                  .then(setOverview)
                  .catch(() => setError("error"))
              }
            />
          )}
          {page === "settings" && (
            <div className="two-col">
              <Panel title={t("settings")}>
                <div className="settings-controls">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={contrast}
                      onChange={(e) => setContrast(e.target.checked)}
                    />
                    {t("highContrast")}
                  </label>
                  <label>
                    {t("textSize")} · {font}%
                    <input
                      type="range"
                      min="90"
                      max="125"
                      step="5"
                      value={font}
                      onChange={(e) => setFont(Number(e.target.value))}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={motion}
                      onChange={(e) => setMotion(e.target.checked)}
                    />
                    {t("reducedMotion")}
                  </label>
                </div>
                <p>{t("accessibilityHelp")}</p>
              </Panel>
              <Panel title={t("dataMode")}>
                <label>
                  {t("source")}
                  <select
                    value={String(live)}
                    onChange={(e) => setLive(e.target.value === "true")}
                  >
                    <option value="false">{t("demoWeather")}</option>
                    <option value="true">{t("liveWeather")}</option>
                  </select>
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const w = await api<Weather>(
                        `/regions/${rid}/weather?live=${live}`,
                      );
                      setWeather(w);
                      const d = w.is_simulated ? w.days.at(-1)! : w.days[0];
                      setFarm((f) => ({
                        ...f,
                        et0: d.et0_mm,
                        rainfall: d.rain_mm,
                        sun_hours: d.radiation_mj_m2 / 3.6,
                      }));
                    })
                  }
                >
                  {t("refreshWeather")}
                </button>
                {weather && (
                  <>
                    <p>
                      {t("source")}: {weather.source}
                    </p>
                    <p>{t("forecastApplied")}</p>
                    <span className="badge">
                      {t(weather.is_simulated ? "simulated" : "forecast")}
                    </span>
                    <p className="caption">
                      {t("updated")}: {weather.updated_at}
                    </p>
                    {weather.fallback_reason && (
                      <p className="warning">{t(weather.fallback_reason)}</p>
                    )}
                    <WeatherChart weather={weather} />
                  </>
                )}
              </Panel>
            </div>
          )}
          {day && page === "agriculture" && (
            <Panel title={t("history")}>
              <div className="weather-stats">
                {[
                  ["temperatureLabel", day.temperature_c, "°C"],
                  ["rain", day.rain_mm, "mm"],
                  ["humidity", day.humidity_pct, "%"],
                  ["wind", day.wind_kmh, "km/h"],
                ].map(([key, val, unit]) => (
                  <div key={key}>
                    <small>{t(String(key))}</small>
                    <strong>
                      {val} {unit}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="caption">
                {weather?.source} ·{" "}
                {t(weather?.is_simulated ? "simulated" : "forecast")} ·{" "}
                {weather?.updated_at}
              </p>
            </Panel>
          )}
        </main>
        <footer>
          <span>
            <Leaf size={14} /> {t("team")}
          </span>
          <span>
            <Activity size={13} /> {t(overview ? "operational" : "loading")}
          </span>
        </footer>
      </div>
    </div>
  );
}
