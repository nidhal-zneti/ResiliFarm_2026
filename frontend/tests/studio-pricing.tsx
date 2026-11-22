import assert from "node:assert/strict";
import { minimumPartPrice, minimumMaterialBudget, minimumLinePrice, sumLocalPrices, formatLocalPrice } from "../src/studioPricing";
import type { MaterialEstimate, Part } from "../src/types";
import type { Design } from "../src/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { BlueprintWorkspace } from "../src/StudioBlueprint";
import StudioDesignSummary from "../src/StudioDesignSummary";
import en from "../src/i18n/en.json";
import fr from "../src/i18n/fr.json";
import ja from "../src/i18n/ja.json";
import ar from "../src/i18n/ar.json";

export async function run() {
  const item = (key: string, quantity: number | null, low: number | null, currency = "TND") => ({
    key, quantity, currency, unit_price_low: low, unit_price: low == null ? null : low + 20,
    unit_price_high: low == null ? null : low + 40,
  }) as MaterialEstimate["items"][number];
  const estimate = { currency: "TND", items: [item("controller", 1, 80), item("soil_sensor", 2, 30), item("pump", 1, 800)] } as MaterialEstimate;
  const parts = [ { key: "esp32", quantity: 1, price_usd: 9 }, { key: "soil", quantity: 2, price_usd: 4 }, { key: "pump", quantity: 1, price_usd: 18 } ] as Part[];
  const priced = parts.map((part) => minimumPartPrice(part, estimate));
  assert.deepEqual(priced.map((price) => price?.amount), [80, 60, 800]);
  assert.equal(sumLocalPrices(priced, "TND").price?.amount, 940);
  assert.deepEqual(minimumMaterialBudget(estimate), sumLocalPrices(priced, "TND"));
  assert.equal(formatLocalPrice(priced[0]!, "en"), "TND 80.00");
  assert.equal(minimumPartPrice({ key: "relay", quantity: 1, price_usd: 5 } as Part, estimate), null);
  assert.equal(sumLocalPrices([...priced, null], "TND").complete, false);
  assert.equal(sumLocalPrices([...priced, null], "TND").price?.amount, 940);
  assert.equal(minimumPartPrice(parts[0]), null, "Legacy USD prices must never substitute for local estimates");
  assert.equal(minimumMaterialBudget().price, null);
  assert.equal(minimumLinePrice(item("controller", null, 80)), null);
  assert.equal(minimumLinePrice(item("controller", 0, null))?.amount, 0);
  assert.equal(minimumLinePrice(item("controller", 3, 0.335))?.amount, 1.01);
  assert.equal(minimumLinePrice(item("controller", 1, NaN)), null);
  assert.equal(minimumLinePrice(item("controller", 1, -3)), null);
  assert.equal(minimumLinePrice(item("controller", 1, 80, "USD")), null);
  const yen = { ...estimate, currency: "JPY", items: [item("controller", 2, 1200, "JPY")] } as MaterialEstimate;
  assert.equal(formatLocalPrice(minimumMaterialBudget(yen).price!, "en"), "JPY 2,400.00");
  const mixed = minimumMaterialBudget({ ...estimate, items: [...estimate.items, ...yen.items] });
  assert.equal(mixed.price?.amount, 940);
  assert.equal(mixed.complete, false);
  assert.equal(minimumPartPrice(parts[0], { ...estimate, currency: "JPY" }), null);
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, fr: { translation: fr }, ja: { translation: ja }, ar: { translation: ar } },
    lng: "en", fallbackLng: false, interpolation: { escapeValue: false },
  });
  for (const locale of ["en", "fr", "ja", "ar"]) {
    await i18n.changeLanguage(locale);
    const design = { bom: [...parts, { key: "relay", quantity: 1, price_usd: 5 }], material_estimate: estimate,
      cost_usd: 129, options: { soil_count: 2, valves: 1 }, instructions: [], connections: [] } as unknown as Design;
    const html = renderToStaticMarkup(createElement(BlueprintWorkspace, {
      design, selected: "esp32", onSelect() {}, projectId: 1, completedSteps: [], onToggleStep() {}, sketchUrl: "", onSketch() {},
    }));
    assert.ok(!html.includes("$") && !html.includes("USD"), `${locale}: no legacy dollar prices`);
    const escaped = (text: string) => renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
    assert.equal(html.split(escaped(formatLocalPrice({ currency: "TND", amount: 940 }, locale))).length - 1, 2,
      `${locale}: summary and grand total must match`);
    assert.ok(html.includes(escaped(i18n.t("partialMinimumBlueprintCost"))));
    assert.ok(html.includes(escaped(i18n.t("priceUnavailable"))));
    const detailedEstimate = { ...estimate, items: [
      { ...item("controller", 1, 7665), label: "Controller", unit: "each", price_basis: "comparable_listings" },
      { ...item("dripline", 20000000, 3), label: "Dripline", unit: "metre", price_basis: "model_estimate" },
      { ...item("pump", null, 800), label: "Pump", unit: "each", price_basis: "model_estimate" },
    ] } as MaterialEstimate;
    const summaryDesign = { ...design, material_estimate: detailedEstimate,
      bom: [{ key: "esp32", quantity: 1 }, { key: "soil", quantity: 11 }] as Part[] };
    const summary = renderToStaticMarkup(createElement(StudioDesignSummary, { design: summaryDesign,
      validation: { valid: true, checks: ["espSupply"], issues: [], warnings: [] } }));
    assert.ok(summary.includes(`<bdi>${escaped(formatLocalPrice({currency: "TND", amount: 60007665}, locale))}</bdi>`),
      `${locale}: full large total must stay in a single amount element`);
    assert.ok(summary.includes(escaped(i18n.t("summaryPricedLines", { priced: 2, total: 3 }))));
    assert.ok(summary.includes(escaped(i18n.t("summaryComponentScope", { types: 2 }))));
    assert.ok(summary.includes(escaped((12).toLocaleString(locale))));
    assert.ok(summary.includes(escaped(i18n.t("summaryCompatibilityScope"))));
    assert.ok(summary.includes(escaped(i18n.t("summaryExcluded"))));
    assert.ok(summary.includes(escaped(i18n.t("priceBasis_model_estimate"))));
    assert.ok(summary.includes(escaped(i18n.t("summaryShowCalculation"))));
    assert.equal((summary.match(/<details /g) ?? []).length, 3);
    const unchecked = renderToStaticMarkup(createElement(StudioDesignSummary, { design: { ...design, material_estimate: undefined }, validation: null }));
    assert.ok(unchecked.includes(escaped(i18n.t("summaryNotChecked"))));
    assert.ok(!unchecked.includes(escaped(i18n.t("valid"))));
    const precise = renderToStaticMarkup(createElement(StudioDesignSummary, { design: { ...design,
      material_estimate: { ...estimate, items: [{ ...item("controller", 3, 0.335), unit: "each" }] } }, validation: null }));
    assert.ok(precise.includes(escaped(formatLocalPrice({ currency: "TND", amount: 0.335 }, locale, 4))));
  }
  console.log("Studio minimum pricing: totals, quantities, rounding, missing prices and currencies passed.");
}
