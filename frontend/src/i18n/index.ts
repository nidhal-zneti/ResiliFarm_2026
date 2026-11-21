import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import fr from "./fr.json";
import ja from "./ja.json";
import ar from "./ar.json";
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    ja: { translation: ja },
    ar: { translation: ar },
  },
  lng: localStorage.getItem("rf-language") || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
