import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import FirmwarePanel from "../src/FirmwarePanel";
import type { Design, FirmwareGeneration } from "../src/types";
import en from "../src/i18n/en.json";
import fr from "../src/i18n/fr.json";
import ja from "../src/i18n/ja.json";
import ar from "../src/i18n/ar.json";

export async function run() {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, fr: { translation: fr }, ja: { translation: ja }, ar: { translation: ar } },
    lng: "en", fallbackLng: false, interpolation: { escapeValue: false },
  });
  const info: FirmwareGeneration = {
    source: "provider", model: "qwen3:4b-instruct", generated_at: "2026-11-22T10:00:00Z",
    based_on_version: 1, board: "esp32-devkit", relay_active_low: false,
    temperature_sensor: "none", hardware_notes: "", requirements: "",
    libraries: [], setup_steps: ["Calibrate sensors"], assumptions: [], limitations: [], pin_map: [],
    compile_status: "passed", hardware_tested: false, outputs_enabled: false,
  };
  const render = (generated: FirmwareGeneration | undefined, state = {}) => renderToStaticMarkup(createElement(FirmwarePanel, {
    design: { firmware: "void setup() {}", firmware_generation: generated } as Design,
    projectId: 1, designVersion: 1,
    busy: false, historical: false, readOnly: false, autoGenerate: false,
    onGenerate: async () => {}, ...state,
  }));
  const escaped = (text: string) => renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
  for (const [language, dictionary] of Object.entries({ en, fr, ja, ar })) {
    await i18n.changeLanguage(language);
    const html = render(info);
    assert.ok(html.includes(escaped(dictionary.firmwareCompilePassed)));
    assert.ok(html.includes(escaped(dictionary.firmwareDownload)));
    assert.ok(html.includes("qwen3:4b-instruct"));
    assert.ok(html.includes("void setup() {}"));
    assert.ok(!/<button[^>]*class="studio-code-regenerate"[^>]*disabled/.test(html), "Generated firmware can be regenerated");
    assert.ok(render({ ...info, compile_status: "not_checked" }).includes(escaped(dictionary.firmwareCompileUnchecked)));
    for (const state of [{ busy: true }, { historical: true }, { readOnly: true }]) {
      assert.match(render(info, state), /<button[^>]*class="studio-code-regenerate"[^>]*disabled/);
    }
    assert.match(render(undefined), /<button[^>]*class="studio-code-regenerate"/,
      "The local template is available without a configured model");
  }
  console.log("Passed: firmware controls, download/code preview and compilation status in EN/FR/JA/AR.");
}
