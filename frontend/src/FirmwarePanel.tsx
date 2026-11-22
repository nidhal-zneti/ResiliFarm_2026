import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Copy, Download, LoaderCircle } from "lucide-react";
import { download } from "./api";
import type { Design } from "./types";

export type FirmwareSettings = {
  board: "esp32-devkit";
  relay_active_low: boolean;
  temperature_sensor: "none" | "sht31";
  hardware_notes: string;
  requirements: string;
};

function blueprintHardwareNotes(design: Design) {
  const parts = design.bom.map((part) => `${part.quantity} × ${part.key}`).join(", ");
  const wiring = design.connections
    .filter((connection) => connection.source === "esp32" || connection.target === "esp32")
    .map((connection) => `${connection.source} → ${connection.target}: ${connection.signal}`)
    .join("; ");
  const temperature = design.bom.some((part) => part.key === "temperature")
    ? "Temperature sensor is listed in the blueprint, but its exact model is unspecified; leave its driver disabled."
    : "No temperature sensor is listed in the blueprint.";
  return [
    "Use the hardware and wiring in this blueprint as the source of truth.",
    `Components: ${parts || "none listed"}.`,
    `Wiring: ${wiring || "no explicit wiring listed"}.`,
    temperature,
    "Relay polarity defaults to active-low; verify the installed module before enabling outputs. Sensor calibration values must be measured.",
  ].join(" ").slice(0, 2000);
}

export default function FirmwarePanel({
  design,
  projectId,
  designVersion,
  busy,
  historical,
  readOnly,
  autoGenerate,
  onGenerate,
}: {
  design: Design;
  projectId: number;
  designVersion: number;
  busy: boolean;
  historical: boolean;
  readOnly: boolean;
  autoGenerate: boolean;
  onGenerate: (settings: FirmwareSettings) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const generated = design.firmware_generation;
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const attemptedVersion = useRef<string | null>(null);
  const generationKey = `${projectId}:${designVersion}`;

  async function generate() {
    if (busy || generating || historical || readOnly) return;
    setGenerating(true);
    setGenerationError("");
    setCopyStatus("");
    try {
      await onGenerate({
        board: "esp32-devkit",
        relay_active_low: generated?.relay_active_low ?? true,
        temperature_sensor: generated?.temperature_sensor ?? "none",
        hardware_notes: blueprintHardwareNotes(design),
        requirements: generated?.requirements ?? "",
      });
    } catch (error) {
      setGenerationError((error as Error).message || "firmwareGenerationFailed");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!autoGenerate || busy || generating || generated || historical || readOnly || attemptedVersion.current === generationKey) return;
    attemptedVersion.current = generationKey;
    void generate();
  }, [autoGenerate, busy, generating, generated, historical, readOnly, generationKey]);

  const code = generated || historical ? design.firmware : "";
  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("studioCopied");
    } catch {
      setCopyStatus("studioCopyFailed");
    }
  }

  return (
    <section className="studio-code-view">
      <div className="studio-step-heading">
        <div><p className="eyebrow">{t("studioStepCode")}</p><h2>{t("firmwarePanelTitle")}</h2></div>
        <button type="button" className="studio-code-regenerate" disabled={busy || generating || historical || readOnly} onClick={() => void generate()}>
          {generating ? <LoaderCircle size={16} className="firmware-spinner" /> : <Code2 size={16} />}
          {t(generated ? "firmwareRegenerate" : "firmwareGenerate")}
        </button>
      </div>
      <p className="caption">{t("firmwarePanelIntro")}</p>
      {historical && <p className="caption" role="status">{t("firmwareHistorical")}</p>}
      {generating && <p className="caption" role="status">{t("firmwareWait")}</p>}
      {generationError && <p className="notice warning" role="alert">{t(generationError, { defaultValue: t("error") })}</p>}
      {generated && <p className="caption">{t("firmwareProvenance", {
        model: generated.model,
        version: generated.based_on_version,
        date: new Date(generated.generated_at).toLocaleString(i18n.language),
      })}</p>}
      {generated && <p className="notice">{t("firmwareReviewNote")}</p>}
      {generated && <p className="caption" role="status">{t(generated.compile_status === "passed" ? "firmwareCompilePassed" : "firmwareCompileUnchecked")}</p>}

      <div className="studio-code-toolbar">
        <span>{t("firmwareGeneratedCode")}</span>
        <div>
          <button type="button" disabled={!code} onClick={() => void copyCode()}><Copy size={15} /> {t("studioCopy")}</button>
          <button type="button" disabled={!code} onClick={() => download("resilifarm.ino", code, "text/plain;charset=utf-8")}>
            <Download size={15} /> {t("firmwareDownload")}
          </button>
        </div>
      </div>
      {copyStatus && <p className="caption" role="status">{t(copyStatus)}</p>}
      <pre className="studio-code-block"><code>{code || (generating ? t("studioCodeGenerating") : t("studioCodeWaiting"))}</code></pre>

      <details className="studio-code-accordion">
        <summary>{t("firmwareSetup")}</summary>
        <div>
          <p>{t("firmwareRunInstructions")}</p>
          <p>{t("firmwareCalibrationNote")}</p>
          {generated?.setup_steps.map((item, index) => <p key={index}>{item}</p>)}
          {generated && <div className="firmware-table"><table>
            <thead><tr><th>{t("firmwareSignal")}</th><th>GPIO</th><th>{t("firmwarePinMode")}</th></tr></thead>
            <tbody>{generated.pin_map.map((pin) => <tr key={pin.symbol}>
              <td>{pin.name} <code>{pin.symbol}</code></td><td>{pin.gpio}</td><td>{pin.mode}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>
      </details>
      <details className="studio-code-accordion">
        <summary>{t("firmwareAssumptions")}</summary>
        <ul>{generated?.assumptions.map((item, index) => <li key={index}>{item}</li>) ?? <li>{t("studioCodeWaiting")}</li>}</ul>
      </details>
      <details className="studio-code-accordion">
        <summary>{t("firmwareLimitations")}</summary>
        <ul>{generated?.limitations.map((item, index) => <li key={index}>{item}</li>) ?? <li>{t("firmwareReviewNote")}</li>}</ul>
      </details>
    </section>
  );
}
