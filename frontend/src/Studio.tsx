import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CircuitBoard,
  Send,
  Plus,
  Download,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type { Project, Validation, Design } from "./types";
import { BlueprintWorkspace } from "./StudioBlueprint";
import "@xyflow/react/dist/style.css";

export default function Studio({
  region,
  onDeploy,
}: {
  region: number;
  onDeploy: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [saved, setSaved] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState("esp32");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<{
    configured: boolean;
    available: boolean;
    model: string;
  } | null>(null);
  const [voltage, setVoltage] = useState(3.3);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [generationStep, setGenerationStep] = useState<"prompt" | "clarify">(
    "prompt",
  );
  const [planPrompt, setPlanPrompt] = useState("");
  const [powerChoice, setPowerChoice] = useState("grid");
  const [networkChoice, setNetworkChoice] = useState("auto");
  const [profileChoice, setProfileChoice] = useState("irrigation");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [progressError, setProgressError] = useState("");
  async function loadList() {
    try {
      setSaved(await api("/aiot/projects"));
    } catch {
      setError("error");
    }
  }
  useEffect(() => {
    loadList();
    api<{ configured: boolean; available: boolean; model: string }>(
      "/aiot/provider",
    )
      .then(setProvider)
      .catch(() => setProvider(null));
  }, []);
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
  function accept(p: Project) {
    setProject(p);
    setValidation(p.design.validation);
    setVoltage(p.design.options.supply_v);
    setVersion(null);
    setDeployed(p.deployed);
    setSelected("esp32");
    setGenerationStep("prompt");
    setPlanPrompt("");
  }
  async function send(
    message = text || t("promptExample"),
    preferences: string[] = [],
  ) {
    await act(async () => {
      const p = await api<Project>(
        project ? `/aiot/projects/${project.id}/messages` : "/aiot/projects",
        {
          text: message,
          language: i18n.language,
          ...(!project
            ? { region_id: region, name: t("studio"), preferences }
            : {}),
        },
        105000,
      );
      accept(p);
      setText("");
      await loadList();
    });
  }
  function prepareBlueprint(e: FormEvent) {
    e.preventDefault();
    if (project) {
      void send();
      return;
    }
    const prompt = text.trim() || t("promptExample");
    setPlanPrompt(prompt);
    setPowerChoice("grid");
    setNetworkChoice("auto");
    setProfileChoice("irrigation");
    setGenerationStep("clarify");
  }
  function buildFromPlan() {
    const prompt = planPrompt.slice(0, 3900);
    const lower = prompt.toLowerCase();
    const preferences: string[] = [];
    if (!/solar|solaire|太陽/.test(lower) && powerChoice === "solar") {
      preferences.push("solar");
    }
    if (networkChoice !== "auto" && !/wi-?fi|lora|ロラ/.test(lower)) {
      preferences.push(networkChoice === "lora" ? "LoRa" : "Wi-Fi");
    }
    if (
      !/greenhouse|serre|温室/.test(lower) &&
      profileChoice === "greenhouse"
    ) {
      preferences.push("greenhouse");
    }
    send(prompt, preferences);
  }
  useEffect(() => {
    if (!project) {
      setCompletedSteps([]);
      setProgressError("");
      return;
    }
    try {
      const savedProgress = window.localStorage.getItem(
        `resilifarm:studio:${project.id}:instructions`,
      );
      const parsed: unknown = savedProgress ? JSON.parse(savedProgress) : [];
      if (
        !Array.isArray(parsed) ||
        parsed.some((step) => typeof step !== "string")
      ) {
        throw new Error("invalidProgress");
      }
      setCompletedSteps(parsed);
      setProgressError("");
    } catch {
      setCompletedSteps([]);
      setProgressError("progressLoadError");
    }
  }, [project?.id]);
  function toggleInstruction(step: string) {
    if (!project) return;
    const next = completedSteps.includes(step)
      ? completedSteps.filter((item) => item !== step)
      : [...completedSteps, step];
    try {
      window.localStorage.setItem(
        `resilifarm:studio:${project.id}:instructions`,
        JSON.stringify(next),
      );
      setCompletedSteps(next);
      setProgressError("");
    } catch {
      setProgressError("progressSaveError");
    }
  }
  const design: Design | undefined =
    version !== null
      ? project?.versions.find((v) => v.version === version)?.design
      : project?.design;
  const part = design?.bom.find((p) => p.key === selected);
  const historical =
    version !== null && version !== project?.versions.at(-1)?.version;
  const [sketchUrl, setSketchUrl] = useState("");
  const promptLower = planPrompt.toLowerCase();
  const askPower = !/solar|solaire|太陽/.test(promptLower);
  const askNetwork = !/wi-?fi|lora|ロラ/.test(promptLower);
  const askProfile = !/greenhouse|serre|温室/.test(promptLower);
  function loadSketch(file?: File) {
    if (!file) return;
    setSketchUrl(URL.createObjectURL(file));
  }
  useEffect(() => {
    return () => {
      if (sketchUrl) URL.revokeObjectURL(sketchUrl);
    };
  }, [sketchUrl]);
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">{t("designLab")}</span>
          <h1>{t("studio")}</h1>
          <p>{t("studioSub")}</p>
        </div>
        <button
          onClick={() => {
            setProject(null);
            setValidation(null);
            setVersion(null);
            setText("");
            setDeployed(false);
            setGenerationStep("prompt");
            setPlanPrompt("");
          }}
        >
          <Plus size={16} />
          {t("newProject")}
        </button>
      </div>
      <div className="notice">
        <CircuitBoard size={18} />
        <div>
          <strong>
            {t(
              provider === null
                ? "studioAiStatusUnknown"
                : provider.configured
                  ? provider.available
                    ? "studioAiReady"
                    : "studioAiNotReady"
                  : "ruleDesigner",
              { model: provider?.model },
            )}
          </strong>
          {provider?.configured && <p>{t("studioAiScope")}</p>}
          {design && (
            <p>
              {t(
                design.generation_source === "provider"
                  ? "studioAiDesign"
                  : "studioRulesDesign",
              )}
            </p>
          )}
          {busy && provider?.configured && (
            <p role="status">{t("studioAiWorking")}</p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="notice warning">
          {t(error, { defaultValue: t("error") })}
        </p>
      )}
      {progressError && (
        <p role="alert" className="notice warning">
          {t(progressError, { defaultValue: t("error") })}
        </p>
      )}
      <div className="studio-grid">
        <Panel title={t("requirements")} className="conversation">
          <label>
            {t("savedProjects")}
            <select
              aria-label={t("savedProjects")}
              value={project?.id || ""}
              onChange={(e) =>
                e.target.value &&
                act(async () =>
                  accept(await api(`/aiot/projects/${e.target.value}`)),
                )
              }
            >
              <option value="">{t("empty")}</option>
              {saved.map((p) => (
                <option value={p.id} key={p.id}>
                  #{p.id} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="messages" aria-live="polite">
            {!project ? (
              <div className="assistant-message">
                <CircuitBoard size={24} />
                <p>{t("promptExample")}</p>
              </div>
            ) : (
              project.messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "user" ? "user-message" : "assistant-message"
                  }
                >
                  {m.role === "user" ? m.text : t(m.text)}
                </div>
              ))
            )}
          </div>
          {!project && generationStep === "clarify" ? (
            <section className="blueprint-plan">
              <h3>{t("blueprintPlan")}</h3>
              <p>{t("planSummary", { prompt: planPrompt })}</p>
              <ol>
                <li>{t("planStepCatalog")}</li>
                <li>{t("planStepMap")}</li>
                <li>{t("planStepValidate")}</li>
              </ol>
              {askPower && (
                <fieldset>
                  <legend>{t("clarifyPower")}</legend>
                  {["grid", "solar"].map((choice) => (
                    <label key={choice}>
                      <input
                        type="radio"
                        name="blueprint-power"
                        value={choice}
                        checked={powerChoice === choice}
                        onChange={() => setPowerChoice(choice)}
                      />
                      {t(`choice_${choice}`)}
                    </label>
                  ))}
                </fieldset>
              )}
              {askNetwork && (
                <fieldset>
                  <legend>{t("clarifyNetwork")}</legend>
                  {["auto", "wifi", "lora"].map((choice) => (
                    <label key={choice}>
                      <input
                        type="radio"
                        name="blueprint-network"
                        value={choice}
                        checked={networkChoice === choice}
                        onChange={() => setNetworkChoice(choice)}
                      />
                      {t(`choice_${choice}`)}
                    </label>
                  ))}
                </fieldset>
              )}
              {askProfile && (
                <fieldset>
                  <legend>{t("clarifyProfile")}</legend>
                  {["irrigation", "greenhouse"].map((choice) => (
                    <label key={choice}>
                      <input
                        type="radio"
                        name="blueprint-profile"
                        value={choice}
                        checked={profileChoice === choice}
                        onChange={() => setProfileChoice(choice)}
                      />
                      {t(`choice_${choice}`)}
                    </label>
                  ))}
                </fieldset>
              )}
              <button
                className="primary wide"
                disabled={busy}
                onClick={buildFromPlan}
              >
                <CircuitBoard size={16} />
                {t(busy ? "loading" : "buildBlueprint")}
              </button>
              <button
                className="wide"
                disabled={busy}
                onClick={() => {
                  setGenerationStep("prompt");
                  setPlanPrompt("");
                }}
              >
                {t("cancelPlan")}
              </button>
            </section>
          ) : (
            <form onSubmit={prepareBlueprint}>
              <label className="sr-only" htmlFor="studio-prompt">
                {t("prompt")}
              </label>
              <textarea
                id="studio-prompt"
                maxLength={project ? 4000 : 3900}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("prompt")}
                rows={5}
              />
              <button className="primary wide" disabled={busy}>
                <Send size={16} />
                {t(busy ? "loading" : project ? "send" : "generate")}
              </button>
            </form>
          )}
          {project && (
            <div className="suggestions">
              {[
                "addSensor",
                "useLora",
                "reduceCost",
                "addSolar",
                "repair",
                "explain",
              ].map((k) => (
                <button disabled={busy} key={k} onClick={() => send(t(k))}>
                  {t(k)} <Plus size={12} />
                </button>
              ))}
            </div>
          )}
        </Panel>
        <div className="studio-center">
          <Panel
            title={t("blueprintBuilder")}
            aside={
              project && (
                <label className="version-label">
                  {t("version")}
                  <select
                    value={version ?? project.versions.at(-1)!.version}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVersion(v);
                      const snapshot = project.versions.find(
                        (x) => x.version === v,
                      )!.design;
                      setValidation(snapshot.validation);
                      setVoltage(snapshot.options.supply_v);
                    }}
                  >
                    {project.versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }
          >
            {design ? (
              <BlueprintWorkspace
                design={design}
                selected={selected}
                onSelect={setSelected}
                projectId={project!.id}
                completedSteps={completedSteps}
                onToggleStep={toggleInstruction}
                sketchUrl={sketchUrl}
                onSketch={loadSketch}
              />
            ) : (
              <div className="empty-design">
                <CircuitBoard size={58} strokeWidth={1} />
                <p>{t("blueprintEmpty")}</p>
                <span>01 → 02 → 03</span>
              </div>
            )}
          </Panel>
        </div>
        <div className="studio-right">
          <Panel title={t("components")}>
            {design ? (
              <>
                <div className="cost">
                  <span>{t("cost")}</span>
                  <strong>${design.cost_usd.toFixed(2)}</strong>
                  <small>USD · {t("estimated")}</small>
                </div>
                <div className="bom">
                  {design.bom.map((p) => (
                    <button
                      key={p.key}
                      className={selected === p.key ? "selected" : ""}
                      onClick={() => setSelected(p.key)}
                    >
                      <span>
                        {t(p.key)} <small>×{p.quantity}</small>
                      </span>
                      <strong>${(p.price_usd * p.quantity).toFixed(0)}</strong>
                    </button>
                  ))}
                </div>
                {part && (
                  <div className="specs">
                    <h3>{t(part.key)}</h3>
                    <dl>
                      {[
                        ["voltage", part.voltage_v + " V"],
                        ["current", part.current_ma + " mA"],
                        ["power", part.power_w + " W"],
                        ["protocol", part.protocol],
                        ["operating", part.operating_c.join(" … ") + " °C"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt>{t(k)}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>{t(part.constraint)}</p>
                  </div>
                )}
                <p className="caption">{t("supplyNote")}</p>
                <p>
                  {t("controllerEnergy")}:{" "}
                  <strong>{design.controller_wh_day} Wh</strong>
                </p>
                <p>
                  {t("pumpBench")}:{" "}
                  <strong>{design.pump_wh_per_hour} Wh</strong>
                </p>
              </>
            ) : (
              <p className="caption">{t("noResult")}</p>
            )}
          </Panel>
          {project && design && (
            <>
              <Panel title={t("validation")}>
                <p className={validation?.valid ? "success" : "warning"}>
                  {validation?.valid ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <AlertTriangle size={17} />
                  )}{" "}
                  {t(validation?.valid ? "valid" : "invalid")}
                </p>
                {validation?.issues.map((k) => (
                  <p role="alert" className="warning" key={k}>
                    {t(k)}
                  </p>
                ))}
                <ul className="check-list">
                  {validation?.checks.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ul>
                <label>
                  {t("testVoltage")}
                  <input
                    type="number"
                    min="0"
                    max="48"
                    step=".1"
                    value={voltage}
                    onChange={(e) => setVoltage(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={busy || historical}
                  className="wide"
                  onClick={() =>
                    act(async () =>
                      setValidation(
                        await api(`/aiot/projects/${project.id}/validate`, {
                          supply_v: voltage,
                          soil_count: design.options.soil_count,
                        }),
                      ),
                    )
                  }
                >
                  {t("validate")}
                </button>
                <p className="caption">{t("qualifiedReview")}</p>
              </Panel>
              <Panel title={t("questions")}>
                {design.questions.map((q) => (
                  <p key={q}>{t(q)}</p>
                ))}
              </Panel>
              <button
                className="primary wide"
                disabled
              >
                {t("hardwareUnavailable")}
              </button>
              <a
                className="button wide"
                href={`/api/v1/aiot/projects/${project.id}/export?language=${i18n.language}&version=${version ?? project.versions.at(-1)!.version}`}
              >
                <Download size={16} />
                {t("export")}
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );
}
