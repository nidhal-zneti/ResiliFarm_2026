import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircuitBoard,
  Download,
  Lock,
  Plus,
  Send,
} from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type {
  Design,
  MaterialEstimate,
  Project,
  Region,
  StudioAssistantResponse,
  StudioConversation,
  Validation,
} from "./types";
import { BlueprintWorkspace } from "./StudioBlueprint";
import { minimumMaterialBudget, minimumLinePrice, minimumUnitPrice, formatLocalPrice } from "./studioPricing";
import FirmwarePanel, { type FirmwareSettings } from "./FirmwarePanel";
import "@xyflow/react/dist/style.css";

type StudioStep = "describe" | "design" | "budget" | "code" | "export";
const STEPS: StudioStep[] = ["describe", "design", "budget", "code", "export"];
const QUICK_STARTS = ["quickStartOlive", "quickStartGreenhouse", "quickStartWheat"] as const;
const QUICK_PROMPTS: Record<(typeof QUICK_STARTS)[number], string> = {
  quickStartOlive: "Design a 1 ha olive drip irrigation system",
  quickStartGreenhouse: "Design a tomato greenhouse irrigation system",
  quickStartWheat: "Design a wheat pivot irrigation system",
};

function formatAmount(value: number, locale: string) {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

function estimateItemPrice(
  item: MaterialEstimate["items"][number],
  locale: string,
  unavailable: string,
) {
  const line = minimumLinePrice(item);
  if (line) return formatLocalPrice(line, locale);
  const unit = minimumUnitPrice(item);
  if (unit) return `${formatLocalPrice(unit, locale)} / ${item.unit}`;
  return unavailable;
}

export default function Studio({
  region,
  readOnly = false,
}: {
  region: number;
  onDeploy: () => void;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<StudioStep>("describe");
  const [text, setText] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [saved, setSaved] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState("esp32");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [voltage, setVoltage] = useState(3.3);
  const [conversations, setConversations] = useState<StudioConversation[]>([]);
  const [conversation, setConversation] = useState<StudioConversation | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showAllParts, setShowAllParts] = useState(false);
  const [expandedBudgetItem, setExpandedBudgetItem] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [progressError, setProgressError] = useState("");
  const [sketchUrl, setSketchUrl] = useState("");

  async function loadList() {
    try {
      setSaved(await api("/aiot/projects"));
    } catch {
      setError("error");
    }
  }

  useEffect(() => {
    void loadList();
    api<StudioConversation[]>("/aiot/assistant/conversations")
      .then(setConversations)
      .catch(() => setConversations([]));
    api<{ regions: Region[] }>("/regions")
      .then((response) => setRegions(response.regions))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [helpOpen]);

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

  function accept(p: Project, destination: StudioStep = "design") {
    setProject(p);
    setValidation(p.design.validation);
    setVoltage(p.design.options.supply_v);
    setVersion(null);
    setSelected("esp32");
    setShowAllParts(false);
    setExpandedBudgetItem(null);
    setStep(destination);
  }

  function newDesign() {
    setProject(null);
    setConversation(null);
    setValidation(null);
    setVersion(null);
    setText("");
    setStep("describe");
    setError("");
    setShowAllParts(false);
    setExpandedBudgetItem(null);
  }

  async function send(message = text) {
    if (!message.trim()) return;
    await act(async () => {
      if (project && !conversation) {
        const updated = await api<Project>(`/aiot/projects/${project.id}/messages`, {
          text: message.trim(),
          language: i18n.language,
        }, 105000);
        accept(updated, "design");
        setText("");
        await loadList();
        return;
      }
      const response = await api<StudioAssistantResponse>("/aiot/assistant/messages", {
        conversation_id: conversation?.id ?? null,
        region_id: region,
        text: message.trim(),
        language: i18n.language,
      }, 180000);
      setConversation(response.conversation);
      setConversations((items) => [
        response.conversation,
        ...items.filter((item) => item.id !== response.conversation.id),
      ]);
      if (response.result.project) accept(response.result.project, "design");
      setText("");
      await loadList();
    });
  }

  async function openConversation(id: number) {
    await act(async () => {
      const thread = await api<StudioConversation>(`/aiot/assistant/conversations/${id}`);
      setConversation(thread);
      setProject(null);
      setValidation(null);
      setVersion(null);
      setStep("describe");
      if (thread.project_id) {
        accept(await api<Project>(`/aiot/projects/${thread.project_id}`), "design");
      }
    });
  }

  function newConversation() {
    setConversation(null);
    setProject(null);
    setValidation(null);
    setVersion(null);
    setText("");
    setStep("describe");
    setError("");
  }

  useEffect(() => {
    if (!project) {
      setCompletedSteps([]);
      setProgressError("");
      return;
    }
    try {
      const savedProgress = window.localStorage.getItem(`resilifarm:studio:${project.id}:instructions`);
      const parsed: unknown = savedProgress ? JSON.parse(savedProgress) : [];
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
        throw new Error("invalidProgress");
      }
      setCompletedSteps(parsed);
      setProgressError("");
    } catch {
      setCompletedSteps([]);
      setProgressError("progressLoadError");
    }
  }, [project?.id]);

  function toggleInstruction(instruction: string) {
    if (!project) return;
    const next = completedSteps.includes(instruction)
      ? completedSteps.filter((item) => item !== instruction)
      : [...completedSteps, instruction];
    try {
      window.localStorage.setItem(`resilifarm:studio:${project.id}:instructions`, JSON.stringify(next));
      setCompletedSteps(next);
      setProgressError("");
    } catch {
      setProgressError("progressSaveError");
    }
  }

  const design: Design | undefined = version !== null
    ? project?.versions.find((item) => item.version === version)?.design
    : project?.design;
  const historical = version !== null && version !== project?.versions.at(-1)?.version;
  const part = design?.bom.find((item) => item.key === selected);
  const currentRegion = regions.find((item) => item.id === region);
  const chatMessages = conversation?.messages ?? project?.messages ?? [];
  const estimate = design?.material_estimate;
  const budget = minimumMaterialBudget(estimate);
  const total = budget.price ? formatLocalPrice(budget.price, i18n.language) : null;
  const sizing = estimate?.irrigation_sizing;
  const formatSizingValue = (value: number | null | undefined) =>
    value == null ? "—" : formatAmount(value, i18n.language);
  const stepIndex = STEPS.indexOf(step);
  const exportVersion = version ?? project?.versions.at(-1)?.version;
  const exportHref = project && exportVersion
    ? `/api/v1/aiot/projects/${project.id}/export?language=${i18n.language}&version=${exportVersion}`
    : "#";

  async function generateFirmware(settings: FirmwareSettings) {
    if (!project) return;
    setBusy(true);
    try {
      const latestVersion = project.versions.at(-1)!.version;
      const updated = await api<Project>(`/aiot/projects/${project.id}/firmware`, {
        ...settings,
        version: latestVersion,
        language: i18n.language,
      }, 600000);
      accept(updated, "code");
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  function loadSketch(file?: File) {
    if (!file) return;
    setSketchUrl(URL.createObjectURL(file));
  }

  useEffect(() => () => {
    if (sketchUrl) URL.revokeObjectURL(sketchUrl);
  }, [sketchUrl]);

  const stepLabels: Record<StudioStep, string> = {
    describe: "studioStepDescribe",
    design: "studioStepDesign",
    budget: "studioStepBudget",
    code: "studioStepCode",
    export: "studioStepExport",
  };

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-title">
          <span className="eyebrow">{t("designLab")}</span>
          <h1>{t("studio")}</h1>
        </div>
        <div className="studio-header-actions">
          <label className="sr-only" htmlFor="studio-saved-projects">{t("savedProjects")}</label>
          <select
            id="studio-saved-projects"
            className="studio-project-picker"
            disabled={busy}
            value={project?.id ?? ""}
            onChange={(event) => {
              const id = Number(event.target.value);
              if (!id) return;
              void act(async () => {
                setConversation(null);
                accept(await api<Project>(`/aiot/projects/${id}`), "design");
              });
            }}
          >
            <option value="">{t("studioOpenDesign")}</option>
            {saved.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.name}</option>)}
          </select>
          <button type="button" disabled={busy || readOnly} onClick={newDesign}>
            <Plus size={16} /> {t("newProject")}
          </button>
          <span className="studio-context-chip" title={`${i18n.language.toUpperCase()} · ${currentRegion?.name ?? ""}`}>
            <span>{i18n.language.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>{currentRegion?.name ?? t("loading")}</span>
          </span>
          <div className="studio-help-wrap">
            <button
              type="button"
              className="studio-help-trigger"
              aria-label={t("studioHelpLabel")}
              aria-expanded={helpOpen}
              aria-controls="studio-help-popover"
              onClick={() => setHelpOpen((open) => !open)}
            >?</button>
            {helpOpen && (
              <div id="studio-help-popover" className="studio-help-popover" role="dialog" aria-label={t("studioHelpTitle")}>
                <button type="button" className="studio-help-close" aria-label={t("close")} onClick={() => setHelpOpen(false)}>×</button>
                <strong>{t("studioHelpTitle")}</strong>
                <ol>
                  <li>{t("studioHelpDescribe")}</li>
                  <li>{t("studioHelpReview")}</li>
                  <li>{t("studioHelpCodeExport")}</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </header>

      {readOnly && (
        <p className="notice read-only-notice">
          <Lock size={16} /> {t("readOnlyNotice")}
        </p>
      )}

      <nav className="studio-stepper" aria-label={t("studioSteps")}>
        {STEPS.map((item, index) => (
          <div className="studio-stepper-item" key={item}>
            <button
              type="button"
              className={index === stepIndex ? "active" : index < stepIndex ? "complete" : ""}
              aria-current={index === stepIndex ? "step" : undefined}
              disabled={index > stepIndex || (index > 0 && !project)}
              onClick={() => setStep(item)}
            >
              <span>{index < stepIndex ? "✓" : index + 1}</span>
              {t(stepLabels[item])}
            </button>
            {index < STEPS.length - 1 && <ChevronRight className="studio-step-arrow" size={16} aria-hidden="true" />}
          </div>
        ))}
      </nav>

      {error && <p role="alert" className="notice warning studio-global-error">{t(error, { defaultValue: t("error") })}</p>}
      {progressError && <p role="alert" className="notice warning studio-global-error">{t(progressError, { defaultValue: t("error") })}</p>}

      <main className={`studio-step-content studio-step-${step}`}>
        {step === "describe" && (
          <Panel title={t("requirements")} className="studio-describe-panel">
            <div className="studio-chat-toolbar">
              <label>
                <span>{t("assistantConversations")}</span>
                <select
                  disabled={busy}
                  aria-label={t("assistantConversations")}
                  value={conversation?.id ?? ""}
                  onChange={(event) => event.target.value
                    ? void openConversation(Number(event.target.value))
                    : newConversation()}
                >
                  <option value="">{t("newConversation")}</option>
                  {conversations.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.title}</option>)}
                </select>
              </label>
            </div>
            <div className="studio-chat-history" aria-live="polite">
              {chatMessages.length ? chatMessages.map((message, index) => (
                <div key={message.id ?? index} className={message.role === "user" ? "user-message" : "assistant-message"}>
                  <p>{message.role === "assistant" ? t(message.text, { defaultValue: message.text }) : message.text}</p>
                  {"payload" in message && message.payload?.answer_basis && <small>{t(`answerBasis_${message.payload.answer_basis}`)}</small>}
                  {"payload" in message && message.payload?.citations?.map((citation) => (
                    <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="citation">{citation.title} ↗</a>
                  ))}
                  {"payload" in message && message.payload?.pending_field && <small>{t("answerOrUnknown")}</small>}
                </div>
              )) : <div className="studio-chat-empty"><CircuitBoard size={28} /><p>{t("assistantIntro")}</p></div>}
            </div>
            {!project && !conversation && (
              <div className="studio-quick-starts" aria-label={t("studioQuickStarts")}>
                {QUICK_STARTS.map((key) => (
                  <button type="button" key={key} disabled={busy || readOnly} onClick={() => void send(QUICK_PROMPTS[key])}>
                    {t(key)}
                  </button>
                ))}
              </div>
            )}
            <form className="studio-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label className="sr-only" htmlFor="studio-prompt">{t("assistantPrompt")}</label>
              <textarea
                id="studio-prompt"
                maxLength={4000}
                disabled={readOnly}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("assistantPrompt")}
                rows={4}
              />
              <button className="primary" disabled={busy || readOnly || !text.trim()}>
                <Send size={16} /> {t(busy ? "loading" : "assistantSend")}
              </button>
            </form>
          </Panel>
        )}

        {step === "design" && design && project && (
          <section className="studio-design-view">
            <div className="studio-step-heading">
              <div><p className="eyebrow">{t("studioStepDesign")}</p><h2>{t("blueprintBuilder")}</h2></div>
              <label className="version-label">
                {t("version")}
                <select
                  disabled={busy}
                  value={version ?? project.versions.at(-1)!.version}
                  onChange={(event) => {
                    const nextVersion = Number(event.target.value);
                    const snapshot = project.versions.find((item) => item.version === nextVersion)?.design;
                    setVersion(nextVersion);
                    if (snapshot) {
                      setValidation(snapshot.validation);
                      setVoltage(snapshot.options.supply_v);
                    }
                  }}
                >
                  {project.versions.map((item) => <option key={item.version} value={item.version}>v{item.version}</option>)}
                </select>
              </label>
            </div>

            <div className="studio-design-hero">
              <div><span>{t("minimumMaterialCost")}</span><strong>{total ?? t("priceUnavailable")}</strong>{!budget.complete && <small>{t("partialPrice")}</small>}</div>
              <div><span>{t("studioHeroParts")}</span><strong>{design.bom.reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
              <div>
                <span>{t("studioHeroCompatibility")}</span>
                <strong className={validation?.valid ? "studio-compatible" : "studio-needs-review"}>
                  {t(validation?.valid ? "valid" : "invalid")}
                </strong>
                <small>{t("studioIssueCount", { count: validation?.issues.length ?? 0 })}</small>
              </div>
            </div>

            <section className="studio-design-parts">
              <div className="studio-section-heading"><h3>{t("studioParts")}</h3><span>{t("studioBomCount", { count: design.bom.length })}</span></div>
              <div className="studio-part-cards">
                {(showAllParts ? design.bom : design.bom.slice(0, 4)).map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={selected === item.key ? "studio-part-card selected" : "studio-part-card"}
                    onClick={() => setSelected(item.key)}
                  >
                    <strong>{t(item.key)}</strong>
                    <span>×{item.quantity}</span>
                    <small>{item.voltage_v} V · {item.protocol}</small>
                  </button>
                ))}
              </div>
              {design.bom.length > 4 && (
                <button type="button" className="studio-see-all" aria-expanded={showAllParts} onClick={() => setShowAllParts((value) => !value)}>
                  {t(showAllParts ? "studioShowFewer" : "studioSeeAll", { count: design.bom.length })} <ChevronRight size={15} />
                </button>
              )}
              <details className="studio-bom-details">
                <summary>{t("studioFullBom", { count: design.bom.length })}</summary>
                <div className="studio-table-wrap"><table className="studio-table">
                  <thead><tr><th>{t("studioItem")}</th><th>{t("quantity")}</th><th>{t("voltage")}</th><th>{t("protocol")}</th></tr></thead>
                  <tbody>{design.bom.map((item) => (
                    <tr key={item.key}><td>{t(item.key)}</td><td>{item.quantity}</td><td>{item.voltage_v} V</td><td>{item.protocol}</td></tr>
                  ))}</tbody>
                </table></div>
              </details>
            </section>

            <details className="studio-detail-accordion">
              <summary>{t("studioEngineeringDetails")}</summary>
              <div className="studio-validation-detail">
                <p className={validation?.valid ? "success" : "warning"}>
                  {validation?.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{" "}
                  {t(validation?.valid ? "valid" : "invalid")}
                </p>
                {validation?.issues.map((issue) => <p role="alert" className="warning" key={issue}>{t(issue)}</p>)}
                <ul>{validation?.checks.map((check) => <li key={check}>{t(check)}</li>)}</ul>
                <label className="studio-voltage-input">{t("testVoltage")}
                  <input type="number" min="0" max="48" step=".1" value={voltage} onChange={(event) => setVoltage(Number(event.target.value))} />
                </label>
                <button type="button" disabled={busy || historical} onClick={() => void act(async () => {
                  setValidation(await api<Validation>(`/aiot/projects/${project.id}/validate`, {
                    supply_v: voltage,
                    soil_count: design.options.soil_count,
                  }));
                })}>{t("validate")}</button>
                {design.questions.map((question) => <p key={question}>{t(question)}</p>)}
              </div>
            </details>

            <details className="studio-detail-accordion">
              <summary>{t("studioDetailedBlueprint")}</summary>
              <BlueprintWorkspace
                design={design}
                selected={selected}
                onSelect={setSelected}
                projectId={project.id}
                completedSteps={completedSteps}
                onToggleStep={toggleInstruction}
                sketchUrl={sketchUrl}
                onSketch={loadSketch}
              />
            </details>
          </section>
        )}

        {step === "budget" && design && (
          <section className="studio-budget-view">
            <div className="studio-step-heading"><div><p className="eyebrow">{t("studioStepBudget")}</p><h2>{t("minimumMaterialCost")}</h2></div></div>
            <div className="studio-budget-summary">
              <strong>{total ?? t("priceUnavailable")}</strong>
              <span>{t(budget.complete ? "completeSupplierEstimate" : "partialSupplierEstimate")}</span>
            </div>
            {sizing && (
              <section className="studio-sizing-card" aria-labelledby="studio-sizing-title">
                <h3 id="studio-sizing-title">{t("irrigationSizingTitle")}</h3>
                <dl className="studio-sizing-grid">
                  <div><dt>{t("irrigationSizingAreaEntered")}</dt><dd>{formatSizingValue(sizing.area_ha)} ha</dd></div>
                  <div><dt>{t("irrigationSizingAreaFromField")}</dt><dd>{formatSizingValue(sizing.geometry_area_ha)} ha</dd></div>
                  <div><dt>{t("irrigationSizingRows")}</dt><dd>{formatSizingValue(sizing.row_count)}</dd></div>
                  <div><dt>{t("irrigationSizingRowsPerZone")}</dt><dd>{sizing.rows_per_zone.length ? sizing.rows_per_zone.join(" / ") : t("priceUnavailable")}</dd></div>
                  <div><dt>{t("irrigationSizingLateralsPerRow")}</dt><dd>{formatSizingValue(sizing.lateral_lines_per_row)}</dd></div>
                  <div><dt>{t("irrigationSizingLaterals")}</dt><dd>{formatSizingValue(sizing.total_lateral_length_m)} m</dd></div>
                  <div><dt>{t("irrigationSizingEmittersPerLateral")}</dt><dd>{formatSizingValue(sizing.emitters_per_lateral)}</dd></div>
                  <div><dt>{t("irrigationSizingEmitters")}</dt><dd>{formatSizingValue(sizing.total_emitters)}</dd></div>
                  <div><dt>{t("irrigationSizingSourceFlow")}</dt><dd>{formatSizingValue(sizing.source_flow_lpm)} L/min</dd></div>
                  <div className="studio-sizing-wide"><dt>{t("irrigationSizingZoneFlows")}</dt><dd>{sizing.zone_flows_lpm.length
                    ? sizing.zone_flows_lpm.map((flow, index) => t("irrigationSizingZoneFlowValue", {
                      zone: index + 1,
                      flow: formatAmount(flow, i18n.language),
                    })).join(" · ")
                    : t("priceUnavailable")}</dd></div>
                </dl>
                <div className="studio-sizing-assumptions">
                  <strong>{t("irrigationSizingAssumptions")}</strong>
                  <ul>{sizing.assumptions.map((assumption) => <li key={assumption}>{t(assumption)}</li>)}</ul>
                </div>
              </section>
            )}
            {estimate?.items.length ? (
              <div className="studio-table-wrap">
                <table className="studio-table studio-budget-table">
                  <thead><tr><th>{t("studioItem")}</th><th>{t("quantity")}</th><th>{t("minimumLineCost")}{estimate?.currency ? ` (${estimate.currency})` : ""}</th></tr></thead>
                  <tbody>{estimate.items.map((item) => {
                    const expanded = expandedBudgetItem === item.key;
                    return (
                      <Fragment key={item.key}>
                        <tr>
                          <td>
                            <button type="button" className="studio-budget-expand" aria-expanded={expanded}
                              onClick={() => setExpandedBudgetItem(expanded ? null : item.key)}>
                              <span aria-hidden="true">{expanded ? "−" : "+"}</span>{t(`material_${item.key}`, { defaultValue: item.label })}
                            </button>
                          </td>
                          <td>{item.quantity ?? "—"} {t(`unit_${item.unit}`, { defaultValue: item.unit })}</td>
                          <td>{item.currency === estimate.currency ? estimateItemPrice(item, i18n.language, t("priceUnavailable")) : t("priceUnavailable")}</td>
                        </tr>
                        {expanded && (
                          <tr key={`${item.key}-details`} className="studio-budget-details-row">
                            <td colSpan={3}>
                              <p>{item.label}</p>
                              {item.price_basis && <small>{t(`priceBasis_${item.price_basis}`)}</small>}
                              {item.assumptions?.map((assumption, index) => <small key={index}>{assumption}</small>)}
                              {(item.sources ?? (item.source_url ? [{ url: item.source_url, title: item.source_title ?? item.source_url, fetched_at: item.source_fetched_at }] : [])).map((source) => (
                                <a key={source.url} className="citation" href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}</tbody>
                </table>
              </div>
            ) : <p className="studio-unavailable-note">{t("studioBudgetUnavailable")}</p>}
            {estimate?.warnings.map((warning) => <p className="caption" key={warning}>{t(warning)}</p>)}
            <p className="caption">{t("supplierEstimateNote")}</p>
            <p className="caption">{t("minimumMaterialNote")}</p>
          </section>
        )}

        {step === "code" && design && project && (
          <FirmwarePanel
            key={`${project.id}:${version ?? project.versions.at(-1)!.version}`}
            design={design}
            projectId={project.id}
            designVersion={version ?? project.versions.at(-1)!.version}
            busy={busy}
            historical={historical}
            readOnly={readOnly}
            autoGenerate={!historical}
            onGenerate={generateFirmware}
          />
        )}

        {step === "export" && design && project && (
          <section className="studio-export-view">
            <div className="studio-step-heading"><div><p className="eyebrow">{t("studioStepExport")}</p><h2>{t("export")}</h2></div></div>
            <div className="studio-export-card">
              <Download size={26} />
              <h3>{project.name}</h3>
              <p>{t("studioExportDescription", { version: exportVersion })}</p>
              <ul>
                <li>{t("studioExportDesign")}</li>
                <li>{t("studioExportParts")}</li>
                <li>{t("studioExportConnections")}</li>
                <li>{t("studioExportCode")}</li>
              </ul>
            </div>
          </section>
        )}
      </main>

      <footer className="studio-bottom-bar">
        <div className="studio-bottom-total">
          <span>{t("minimumMaterialCost")}</span>
          <strong>{project ? total ?? t("priceUnavailable") : "—"}</strong>
          {project && estimate && <small>{t(budget.complete ? "completeSupplierEstimate" : "partialSupplierEstimate")}</small>}
        </div>
        {step === "export" && project ? (
          <a className="primary studio-next-button" href={exportHref}>
            <Download size={17} /> {t("studioExportDesignPackage")}
          </a>
        ) : (
          <button
            type="button"
            className="primary studio-next-button"
            disabled={!project || busy}
            onClick={() => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)])}
          >
            {t("studioNext")} <ChevronRight size={17} />
          </button>
        )}
      </footer>
    </div>
  );
}
