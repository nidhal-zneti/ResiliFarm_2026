import { I18nManager } from 'react-native';

/**
 * Right-to-left support.
 *
 * React Native mirrors `flexDirection: 'row'` layouts automatically when RTL is
 * enabled, so components should use logical properties (start/end) rather than
 * hard-coded left/right. Toggling direction requires an app reload, so
 * `applyRTL` reports whether a restart is needed.
 */
export const RTL_LANGUAGES = ['ar'] as const;

export function isRTLLanguage(locale: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(locale);
}

export function applyRTL(locale: string): { needsReload: boolean } {
  const shouldBeRTL = isRTLLanguage(locale);
  I18nManager.allowRTL(shouldBeRTL);

  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    return { needsReload: true };
  }
  return { needsReload: false };
}
