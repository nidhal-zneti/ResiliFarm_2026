import { AlertTriangle, CheckCircle2, Droplets, HelpCircle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/Card';
import { colors, radius, spacing, StatusTone, toneStyles, typography } from '@/theme';
import type { IrrigationAdvice } from '@/types';

type StatusConfig = {
  tone: StatusTone;
  Icon: typeof Droplets;
  titleKey: string;
};

const CONFIG: Record<IrrigationAdvice['status'], StatusConfig> = {
  needed: { tone: 'warning', Icon: Droplets, titleKey: 'home.irrigationNeeded' },
  not_needed: { tone: 'success', Icon: CheckCircle2, titleKey: 'home.irrigationNotNeeded' },
  unavailable: { tone: 'neutral', Icon: HelpCircle, titleKey: 'home.irrigationUnavailable' },
};

/**
 * The most important card on the screen: should I irrigate today, and how much?
 * Colour + icon + one sentence make the answer readable in a couple of seconds.
 */
export function IrrigationAdviceCard({ advice }: { advice: IrrigationAdvice }) {
  const { t } = useTranslation();
  const { tone, Icon, titleKey } = CONFIG[advice.status];
  const { fg } = toneStyles[tone];

  const showAmount = advice.status === 'needed' && advice.waterM3 != null;

  return (
    <Card tone={tone} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${fg}22` }]}>
          <Icon size={24} color={fg} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t('home.todayAdvice')}</Text>
          <Text style={[styles.title, { color: fg }]}>{t(titleKey)}</Text>
        </View>
      </View>

      {showAmount ? (
        <View>
          <View style={styles.amountRow}>
            <Text style={styles.amount}>{advice.waterM3}</Text>
            <Text style={styles.amountUnit}>{t('units.m3')}</Text>
          </View>
          <Text style={styles.amountLabel}>{t('home.recommendedWater')}</Text>
        </View>
      ) : null}

      {advice.status === 'unavailable' ? (
        <Text style={styles.reason}>{t('home.adviceUnavailableHelp')}</Text>
      ) : advice.reason ? (
        <Text style={styles.reason}>{advice.reason}</Text>
      ) : null}

      {advice.warning ? (
        <View style={styles.warning}>
          <AlertTriangle size={16} color={colors.warning} />
          <Text style={styles.warningText}>{advice.warning}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...typography.subtitle,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  amount: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '700',
    color: colors.text,
  },
  amountUnit: {
    ...typography.subtitle,
    color: colors.textMuted,
    marginBottom: 6,
  },
  amountLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: -spacing.xs,
  },
  reason: {
    ...typography.small,
    color: colors.text,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  warningText: {
    ...typography.small,
    color: colors.text,
    flex: 1,
  },
});
