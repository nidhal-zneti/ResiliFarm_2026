import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

/** Languages shipped today. Adding a language = add a JSON file + its code here. */
export const SUPPORTED_LOCALES = ['fr', 'ar', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** AsyncStorage key used to remember the user's chosen language. */
export const LOCALE_STORAGE_KEY = 'resilifarm.locale';

/** First run: use the device language when supported, otherwise French. */
function detectLocale(): AppLocale {
  const code = getLocales()[0]?.languageCode ?? 'fr';
  return (SUPPORTED_LOCALES as readonly string[]).includes(code)
    ? (code as AppLocale)
    : 'fr';
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: detectLocale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
