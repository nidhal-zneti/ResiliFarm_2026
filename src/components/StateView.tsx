import { AlertTriangle } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';
import { errorMessage } from '@/utils/errors';

/** Centred spinner shown while a screen loads. */
export function LoadingState() {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{t('common.loading')}</Text>
    </View>
  );
}

/** Friendly error state with a retry button. */
export function ErrorState({ code, onRetry }: { code: string | null; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <AlertTriangle size={40} color={colors.warning} />
      <Text style={styles.title}>{t('common.error')}</Text>
      <Text style={styles.text}>{errorMessage(t, code)}</Text>
      <Button label={t('common.retry')} onPress={onRetry} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: {
    ...typography.subtitle,
    color: colors.text,
  },
  text: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
