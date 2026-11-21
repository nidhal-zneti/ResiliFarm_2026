import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppLocale, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from '@/i18n';
import { applyRTL } from '@/utils/rtl';

/**
 * Read and change the app language, remember the choice, and prepare RTL.
 */
export function useLocale() {
  const { i18n } = useTranslation();
  const [locale, setLocaleState] = useState<AppLocale>(i18n.language as AppLocale);

  const setLocale = useCallback(
    async (next: AppLocale) => {
      await i18n.changeLanguage(next);
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
      applyRTL(next);
      setLocaleState(next);
    },
    [i18n],
  );

  return { locale, setLocale };
}

/** Restore the saved language on startup. Returns the applied locale. */
export async function restoreLocale(): Promise<AppLocale | null> {
  const saved = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) {
    return saved as AppLocale;
  }
  return null;
}
