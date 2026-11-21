import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AlertBanner } from '@/components/AlertBanner';
import { SectionHeader } from '@/components/SectionHeader';
import { colors, spacing, typography } from '@/theme';
import type { Alert } from '@/types';
import { alertIcon } from '@/utils/alertIcon';

/** Risks and warnings, in plain language. */
export function AlertsList({
  alerts,
  onSeeAll,
}: {
  alerts: Alert[];
  onSeeAll?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <SectionHeader
        title={t('home.alerts')}
        actionLabel={onSeeAll ? t('home.seeAll') : undefined}
        onAction={onSeeAll}
      />

      {alerts.length === 0 ? (
        <Text style={styles.empty}>{t('home.noAlerts')}</Text>
      ) : (
        <View style={styles.list}>
          {alerts.map((alert) => (
            <AlertBanner
              key={alert.id}
              tone={alert.tone}
              title={alert.title}
              message={alert.message}
              icon={alertIcon(alert.tone)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  empty: {
    ...typography.small,
    color: colors.textMuted,
  },
});
