import { CalendarDays, Droplets, CloudRain, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { getMyFarm } from '@/api/farms';
import { getIrrigationSchedule } from '@/api/schedule';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateView';
import { useAsync } from '@/hooks/useAsync';
import { colors, spacing, typography } from '@/theme';

export default function ScheduleScreen() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(async () => {
    const farm = await getMyFarm();
    const schedule = await getIrrigationSchedule(farm.id);
    return { farm, schedule };
  }, []);

  if (loading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen scroll={false}>
        <ErrorState code={error} onRetry={reload} />
      </Screen>
    );
  }

  const planned = data.schedule.days.filter((day) => day.needed);
  const nextWatering = planned[0];

  return (
    <Screen>
      <Text style={styles.title}>{t('schedule.title')}</Text>

      <Card tone={nextWatering ? 'info' : 'success'}>
        <View style={styles.summary}>
          <View style={styles.summaryIcon}>
            <CalendarDays size={24} color={colors.primary} />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>
              {nextWatering ? t('schedule.nextIrrigation') : t('schedule.noIrrigationNeeded')}
            </Text>
            {nextWatering ? (
              <Text style={styles.summaryValue}>
                {formatDate(nextWatering.date)} · {nextWatering.waterM3} m³
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('schedule.nextSevenDays')}</Text>
      {data.schedule.days.map((day) => (
        <Card key={day.date} tone={day.needed ? 'info' : 'neutral'}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.date}>{formatDate(day.date)}</Text>
              <Text style={styles.reason}>{scheduleReason(t, day.reason)}</Text>
            </View>
            {day.needed ? (
              <Droplets size={26} color={colors.info} />
            ) : day.rainMm > 0 ? (
              <CloudRain size={26} color={colors.info} />
            ) : (
              <Sun size={26} color={colors.warning} />
            )}
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t('schedule.rain')}</Text>
              <Text style={styles.metricValue}>{day.rainMm} mm</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t('schedule.evaporation')}</Text>
              <Text style={styles.metricValue}>{day.et0Mm} mm</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t('schedule.water')}</Text>
              <Text style={styles.metricValue}>
                {day.needed ? `${day.waterM3} m³` : t('schedule.none')}
              </Text>
            </View>
          </View>
        </Card>
      ))}

      <Text style={styles.source}>{data.schedule.source}</Text>
    </Screen>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

function scheduleReason(t: (key: string) => string, reason: string) {
  const key = `schedule.reason.${reason}`;
  return t(key);
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  summaryValue: {
    ...typography.small,
    color: colors.textMuted,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  reason: {
    ...typography.small,
    color: colors.textMuted,
  },
  metrics: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  metricValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  source: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
