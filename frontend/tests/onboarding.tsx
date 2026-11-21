import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { SectionGuide, StartHere } from "../src/Guide";
import { FarmForm } from "../src/components";
import en from "../src/i18n/en.json";
import fr from "../src/i18n/fr.json";
import ja from "../src/i18n/ja.json";
import ar from "../src/i18n/ar.json";

export async function run() {
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ja: { translation: ja },
      ar: { translation: ar },
    },
    lng: "en",
    fallbackLng: false,
    interpolation: { escapeValue: false },
  });
  const escaped = (text: string) =>
    renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
  let combinations = 0;
  for (const [language, dictionary] of Object.entries({ en, fr, ja, ar })) {
    await i18n.changeLanguage(language);
    for (const mode of ["beginner", "professional"] as const) {
      const home = renderToStaticMarkup(
        createElement(StartHere, { mode, onNavigate() { } }),
      );
      assert.ok(home.includes(escaped(dictionary.homeTitle)));
      for (const [section, guide] of Object.entries(dictionary.guides)) {
        assert.ok(
          home.includes(`href="#${section}"`),
          `${language}: missing ${section} link`,
        );
        const html = renderToStaticMarkup(
          createElement(SectionGuide, { section, mode }),
        );
        for (const text of [
          guide.purpose,
          guide.inputs,
          guide.results,
          guide.beginner,
          ...guide.steps,
        ]) {
          assert.ok(
            html.includes(escaped(text)),
            `${language}/${mode}/${section}: missing guidance`,
          );
        }
        assert.equal(
          html.includes(escaped(guide.professional)),
          mode === "professional",
        );
        combinations++;
      }
    }
  }
  // Browser step validation must accept ordinary areas and the seeded ET0.
  const farm = {
    region_id: 1,
    crop: "olive",
    stage: "mid",
    area_ha: 2,
    efficiency: 0.85,
    et0: 5.95,
    rainfall: 0.4,
    head_m: 30,
    pump_efficiency: 0.65,
    solar_kw: 12,
    sun_hours: 5.5,
  };
  const form = renderToStaticMarkup(
    createElement(FarmForm, {
      value: farm,
      onChange() { },
      onSubmit() { },
      busy: false,
    }),
  );
  const numericInputs = [...form.matchAll(/<input[^>]+type="number"[^>]*>/g)];
  assert.equal(numericInputs.length, 8);
  for (const [input] of numericInputs) {
    const attr = (name: string) =>
      Number(input.match(new RegExp(`${name}="([^"]+)"`))![1]);
    const steps = (attr("value") - attr("min")) / attr("step");
    assert.ok(
      Math.abs(steps - Math.round(steps)) < 1e-8,
      `Browser would reject ${input}`,
    );
  }
  console.log(
    `Passed ${combinations} localized section/mode renders, 66 Start Here links and farm-input validity checks.`,
  );
}
