import { Info } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '@/theme';

/**
 * Always shown while the app runs on mock data, so demonstration values are
 * never mistaken for real measurements.
 */
export function DemoBanner() {
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <Info size={16} color={colors.info} />
      <Text style={styles.text}>{t('common.demoBanner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  text: {
    ...typography.caption,
    color: colors.info,
    flex: 1,
  },
});
