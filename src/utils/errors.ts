import type { TFunction } from 'i18next';

/**
 * Turn an API error code (e.g. 'network', 'invalidCredentials') into a
 * translated, farmer-friendly sentence.
 */
export function errorMessage(t: TFunction, code: string | null | undefined): string {
  if (!code) return t('common.error');
  return t(`errors.${code}`, { defaultValue: t('common.error') });
}
