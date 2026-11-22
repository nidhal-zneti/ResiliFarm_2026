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
  FlaskConical,
  ScanSearch,
  CircuitBoard,
  Settings,
  ArrowUpRight,
  ChevronRight,
  Menu,
  ArrowRight,
  Activity,
  Download,
  Home,
  Lock,
  UserRound,
  ClipboardCheck,
  UserCog,
} from "lucide-react";
import { api, download, getToken, setToken } from "./api";
import {
  Panel,
  Metrics,
  WeatherChart,
  FarmForm,
} from "./components";
import Studio from "./Studio";
import { AuthScreen, ProfileView } from "./Auth";
import { ExperienceMode, SectionGuide, StartHere } from "./Guide";
import MapControls from "./MapControls";
import AgronomistDashboardView from "./AgronomistDashboard";
import AdminView from "./AdminComplete";
import FruitRipeness from "./FruitRipeness";
import type {
  Region,
  Overview,
  Farm,
  FarmDraft,
  Calculation,
  Weather,
  SoilModel,
  User,
  AuthResponse,
} from "./types";

const pages = [
  ["home", Home],
  ["overview", LayoutDashboard],
  ["twin", Map],
  ["agriculture", Sprout],
  ["water", Droplets],
  ["simulator", FlaskConical],
  ["fruitRipeness", ScanSearch],
  ["studio", CircuitBoard],
  ["agronomist", ClipboardCheck],
  ["admin", UserCog],
  ["settings", Settings],
  ["profile", UserRound],
] as const;
const knownPages = new Set(pages.map(([key]) => key));
const publicPages = new Set(["home", "overview", "twin"]);
function initialPage() {
  const hash = location.hash.slice(1);
  return knownPages.has(hash as (typeof pages)[number][0]) ? hash : "home";
}
const initialFarm: FarmDraft = { region_id: 1 };

function weatherOnlyOverview(region: Region, weather: Weather): Overview {
  return { region, weather, calculation: null, fields: [], devices: [], network: null, risks: null };
}

function requireCurrentWeather(weather: Weather): Weather {
  if (!weather || !weather.current || !Array.isArray(weather.days)) {
    throw new Error("weatherUnavailable");
  }
  return weather;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(initialPage);
  const [menu, setMenu] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [country, setCountry] = useState(1);
  const [rid, setRid] = useState(1);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [soilModel, setSoilModel] = useState<SoilModel | null>(null);
  const [farm, setFarm] = useState<FarmDraft>(initialFarm);
  const [calculatedFarm, setCalculatedFarm] = useState<Farm | null>(null);
  const [calc, setCalc] = useState<Calculation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contrast, setContrast] = useState(
    localStorage.getItem("rf-contrast") === "true",
  );
  const [font, setFont] = useState(
    Number(localStorage.getItem("rf-font") || 100),
  );
  const [motion, setMotion] = useState(
    localStorage.getItem("rf-motion") === "true",
  );
  const [mode, setMode] = useState<ExperienceMode>(() =>
    localStorage.getItem("rf-mode") === "professional"
      ? "professional"
      : "beginner",
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const isAgronomist = role === "AGRONOMIST" || isAdmin;
  const isFarmer = role === "FARMER";
  const canViewPage =
    page === "agronomist" ? isAgronomist : page === "admin" ? isAdmin : true;
  const locked =
    (!user && !publicPages.has(page) && page !== "profile") ||
    (!!user && !canViewPage);
  const navPages = pages.filter(([key]) =>
    key === "admin" ? false : key === "agronomist" ? isAgronomist : true,
  );
  const selectedRegion = regions.find((r) => r.id === rid);
  const navigate = (p: string) => {
    location.hash = p;
    setPage(p);
    setMenu(false);
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  };
  const handleAuthenticated = (result: AuthResponse) => {
    setToken(result.token);
    setUser(result.user);
    navigate(result.user.role === "ADMIN" ? "admin" : "profile");
  };
  const signOut = () => {
    setToken(null);
    setUser(null);
    navigate("profile");
  };
  useEffect(() => {
    if (user && !canViewPage) navigate("home");
  }, [user, page, canViewPage]);
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
    if (!getToken()) {
      setAuthReady(true);
      return;
    }
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
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
    setOverview(null);
    setWeather(null);
    setSoilModel(null);
    setCalc(null);
    await act(async () => {
      const r = await api<{ regions: Region[] }>("/regions");
      setRegions(r.regions);
      const region = r.regions.find((item) => item.id === rid);
      const current = requireCurrentWeather(
        await api<Weather>(`/regions/${rid}/weather`),
      );
      setOverview(region ? weatherOnlyOverview(region, current) : null);
      setWeather(current);
      setSoilModel(await api<SoilModel>(`/regions/${rid}/soil`).catch(() => null));
      setCalc(null);
      setFarm({ region_id: rid });
      setCalculatedFarm(null);
    });
  }, [rid]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const refresh = async () => {
      try {
        const current = requireCurrentWeather(
          await api<Weather>(`/regions/${rid}/weather`),
        );
        setWeather(current);
        setSoilModel(await api<SoilModel>(`/regions/${rid}/soil`).catch(() => null));
        setOverview((value) => value ? { ...value, weather: current } : selectedRegion ? weatherOnlyOverview(selectedRegion, current) : null);
        setCalc(null);
        setCalculatedFarm(null);
        setError("");
      } catch (e) {
        setWeather(null);
        setOverview(null);
        setCalc(null);
        setCalculatedFarm(null);
        setError((e as Error).message);
      }
    };
    const timer = window.setInterval(refresh, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [rid, selectedRegion]);
  const calculate = () =>
    act(async () => {
      const required: (keyof Omit<Farm, "region_id">)[] = [
        "crop", "stage", "area_ha", "efficiency", "et0", "rainfall",
        "head_m", "pump_efficiency", "solar_kw", "sun_hours",
      ];
      if (required.some((key) => farm[key] === undefined))
        throw new Error(t("farmInputsRequired"));
      const input = { ...farm, region_id: rid } as Farm;
      const result = await api<Calculation>(
        "/recommendations/irrigation",
        input,
      );
      setCalc(result);
      setCalculatedFarm(input);
    });
  const applyWeatherForecast = () => {
    const day = weather?.days[0];
    if (!day) return;
    setCalc(null);
    setCalculatedFarm(null);
    setFarm((value) => ({
      ...value,
      et0: day.et0_mm,
      rainfall: day.rain_mm,
      sun_hours: day.radiation_mj_m2 / 3.6,
    }));
  };
  const updateFarm = (value: FarmDraft) => {
    setFarm(value);
    setCalc(null);
    setCalculatedFarm(null);
  };
  const day = weather?.days.at(0);
  const sectionTitle = pages.some(([p]) => p === page)
    ? t(page)
    : t("overview");
  const showHeader =
    page !== "home" &&
    page !== "overview" &&
    page !== "studio" &&
    page !== "profile" &&
    page !== "agronomist" &&
    page !== "admin";
  const initials = user
    ? user.full_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
    : "";
  if (page === "admin" && isAdmin) {
    return <AdminView />;
  }

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
          {navPages.map(([key, Icon]) => (
            <div key={key}>
              {key === "simulator" && (
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
                {!user && !publicPages.has(key) && key !== "profile" && (
                  <Lock size={13} className="nav-lock" />
                )}
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
              <option value="ar">العربية</option>
            </select>
            <button
              className="avatar"
              onClick={() => navigate("profile")}
              aria-label={t(user ? "profile" : "signIn")}
              title={user ? user.full_name : t("signIn")}
            >
              {initials || <UserRound size={17} />}
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
          {locked ? (
            <AuthScreen
              onAuthenticated={handleAuthenticated}
              heading={t("unauthenticated")}
            />
          ) : (
            <>
              {showHeader && (
                <div className="section-intro">
                  <div>
                    <span className="eyebrow">{t("intelligence")}</span>
                    <h1>{sectionTitle}</h1>
                    <p>
                      {t(
                        page === "simulator"
                          ? "scenarioHelp"
                          : page === "fruitRipeness"
                            ? "fruitIntro"
                            : "sampleNote",
                      )}
                    </p>
                  </div>
                </div>
              )}
              {page === "home" && <StartHere mode={mode} onNavigate={navigate} />}
              {page === "agronomist" && <AgronomistDashboardView />}
              {page === "admin" && <AdminView />}
              {page !== "home" &&
                page !== "profile" &&
                page !== "agronomist" &&
                page !== "admin" && (
                  <SectionGuide section={page} mode={mode} />
                )}
              {page === "overview" && weather && (
                <>
                  <div className="section-intro">
                    <div>
                      <span className="eyebrow">
                        {t("workspace")} / {selectedRegion?.name.toUpperCase()}
                      </span>
                      <h1>{t("welcome")}</h1>
                      <p>{t("overviewSub")}</p>
                    </div>
                    <button className="primary" onClick={() => navigate("settings")}>
                      <Activity size={17} />
                      {t("refreshWeather")}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <Panel title={t("currentWeather")} aside={<span className="badge">{t("modelWeather")}</span>}>
                    <div className="weather-stats">
                      {[
                        ["temperatureLabel", weather.current.temperature_2m, "°C"],
                        ["humidity", weather.current.relative_humidity_2m, "%"],
                        ["rain", weather.current.precipitation, `mm / ${Math.round(weather.current.interval_seconds / 60)} min`],
                        ["wind", weather.current.wind_speed_10m, "km/h"],
                      ].map(([key, value, unit]) => (
                        <div key={String(key)}><small>{t(String(key))}</small><strong>{value} {unit}</strong></div>
                      ))}
                    </div>
                    <p className="caption">{weather.source} · {t("weatherValidAt")}: {weather.updated_at}</p>
                    <p className="caption">{t("weatherGridNote")}</p>
                    <p className="caption">{t("weatherUpdates")}</p>
                  </Panel>
                  <Panel title={t("forecast")} aside={<span className="badge">{t("forecast")}</span>}>
                    <WeatherChart weather={weather} />
                  </Panel>
                  <Panel title={t("farmDataStatus")}>
                    <p>{t("noFarmTelemetry")}</p>
                  </Panel>
                </>
              )}
              {page === "overview" && !weather && (
                <Panel title={t("currentWeather")}>
                  <p role={error ? "alert" : "status"}>
                    {error
                      ? t(error, { defaultValue: t("weatherUnavailable") })
                      : busy
                        ? t("loading")
                        : t("weatherUnavailable")}
                  </p>
                  <button onClick={load}>{t("retry")}</button>
                </Panel>
              )}
              {page === "twin" && selectedRegion && weather && (
                <div className="twin-layout">
                  <Panel className="map-panel" title={t("regionLocation")}>
                    <MapContainer key={rid} center={[selectedRegion.lat, selectedRegion.lon]} zoom={8} zoomControl={false} scrollWheelZoom={false} style={{ height: 460, width: "100%" }}>
                      <MapControls />
                      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <CircleMarker center={[selectedRegion.lat, selectedRegion.lon]} radius={8} pathOptions={{ color: "#fff", fillColor: "#21735a", fillOpacity: 0.9, weight: 3 }} />
                    </MapContainer>
                    <p className="caption">{t("regionCoordinatesOnly")}</p>
                  </Panel>
                  <Panel title={t("currentWeather")} aside={<span className="badge">{t("modelWeather")}</span>}>
                    <div className="weather-stats">
                      {[["temperatureLabel", weather.current.temperature_2m, "°C"], ["humidity", weather.current.relative_humidity_2m, "%"], ["rain", weather.current.precipitation, "mm"], ["wind", weather.current.wind_speed_10m, "km/h"]].map(([key, value, unit]) => <div key={String(key)}><small>{t(String(key))}</small><strong>{value} {unit}</strong></div>)}
                    </div>
                    <p>{t("noFarmTelemetry")}</p>
                    <p className="caption">{weather.source} · {weather.updated_at}</p>
                  </Panel>
                  <Panel title={t("soilModelTitle")} aside={<span className="badge">{t("modeledValue")}</span>}>
                    {soilModel ? <>
                      <div className="weather-stats">
                        {[["soilSurface", "soil_moisture_0_to_1cm", "%"], ["soilRootZone", "soil_moisture_9_to_27cm", "%"], ["soilTemperature", "soil_temperature_6cm", "°C"]].map(([label, key, unit]) => {
                          const raw = soilModel.current[key];
                          const value = raw == null ? null : key.startsWith("soil_moisture_") ? Math.round(raw * 1000) / 10 : Math.round(raw * 10) / 10;
                          return <div key={key}><small>{t(label)}</small><strong>{value == null ? "—" : `${value} ${unit}`}</strong></div>;
                        })}
                      </div>
                      <p className="caption">{t("soilModelNote")} · {soilModel.updated_at}</p>
                    </> : <p role="status">{t("soilModelUnavailable")}</p>}
                  </Panel>
                </div>
              )}
              {page === "twin" && !(selectedRegion && weather) && (
                <Panel title={t("regionLocation")}>
                  <p role={error ? "alert" : "status"}>
                    {error
                      ? t(error, { defaultValue: t("weatherUnavailable") })
                      : busy
                        ? t("loading")
                        : t("weatherUnavailable")}
                  </p>
                  <button onClick={load}>{t("retry")}</button>
                </Panel>
              )}
              {page === "agriculture" && !calc && (
                <Panel title={t("calculate")}>
                  <p>{t("realFarmInputsOnly")}</p>
                  <button type="button" onClick={applyWeatherForecast} disabled={!weather}>{t("useWeatherForecastInputs")}</button>
                  <FarmForm value={farm} onChange={updateFarm} onSubmit={calculate} busy={busy} />
                </Panel>
              )}
              {page === "agriculture" && calc && (
                <>
                  <Panel title={t("calculate")}>
                    <button type="button" onClick={applyWeatherForecast} disabled={!weather}>{t("useWeatherForecastInputs")}</button>
                    <FarmForm
                      value={farm}
                      onChange={updateFarm}
                      onSubmit={calculate}
                      busy={busy}
                    />
                  </Panel>
                  <p className="caption">{t("inputNote")}</p>
                  <p className="caption">{t("calculationEstimate")}</p>
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
                </>
              )}
              {page === "water" && <Panel title={t("network")}><p>{t("noWaterTelemetry")}</p></Panel>}
              {page === "simulator" && <Panel title={t("scenario")}><p>{t("scenarioLiveUnavailable")}</p></Panel>}
              {page === "fruitRipeness" && <FruitRipeness />}
              {page === "studio" && (
                <Studio
                  region={rid}
                  readOnly={isFarmer}
                  onDeploy={() =>
                    api<Overview>(`/regions/${rid}/overview`)
                      .then(setOverview)
                      .catch(() => setError("error"))
                  }
                />
              )}
              {page === "profile" && (
                <>
                  {user ? (
                    <ProfileView
                      user={user}
                      onUpdate={setUser}
                      onSignOut={signOut}
                    />
                  ) : authReady ? (
                    <AuthScreen onAuthenticated={handleAuthenticated} />
                  ) : null}
                </>
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
                    <p>{t("modelWeatherPolicy")}</p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          setWeather(null);
                          setCalc(null);
                          setCalculatedFarm(null);
                          const w = requireCurrentWeather(
                            await api<Weather>(`/regions/${rid}/weather`),
                          );
                          setWeather(w);
                          setOverview((o) => o ? { ...o, weather: w } : selectedRegion ? weatherOnlyOverview(selectedRegion, w) : null);
                          setCalc(null);
                          setCalculatedFarm(null);
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
                        <span className="badge">
                          {t(weather.is_measured ? "measured" : "modelWeather")}
                        </span>
                        <p className="caption">
                          {t("updated")}: {weather.updated_at}
                        </p>
                        <WeatherChart weather={weather} />
                      </>
                    )}
                  </Panel>
                </div>
              )}
              {day && page === "agriculture" && (
                <Panel title={t("forecastDays")}>
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
                    {t("modelWeather")} ·{" "}
                    {weather?.updated_at}
                  </p>
                </Panel>
              )}
            </>
          )}
        </main>
        <footer>
          <span>
            <Leaf size={14} /> {t("team")}
          </span>
          <span>
            <Activity size={13} /> {weather
              ? t("weatherConnected")
              : error
                ? t(error, { defaultValue: t("weatherUnavailable") })
                : t("loading")}
          </span>
        </footer>
      </div>
    </div>
  );
}
