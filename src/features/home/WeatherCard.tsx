import { Droplets, Thermometer, Wind } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/Card';
import { StatTile } from '@/components/StatTile';
import { colors, radius, spacing, typography } from '@/theme';
import type { Weather } from '@/types';
import { weatherIcon, weatherLabel, weekdayShort } from '@/utils/weather';

/** Current conditions + a short, icon-based forecast. No technical charts. */
export function WeatherCard({ weather }: { weather: Weather }) {
  const { t, i18n } = useTranslation();
  const { now, days } = weather;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.weather')}</Text>
        <Text style={styles.source} numberOfLines={1}>
          {weather.source}
        </Text>
      </View>

      <View style={styles.hero}>
        {weatherIcon(now.condition, 52, colors.primary)}
        <View style={styles.heroText}>
          <Text style={styles.temp}>
            {Math.round(now.temperatureC)}
            <Text style={styles.tempUnit}> {t('units.celsius')}</Text>
          </Text>
          <Text style={styles.condition}>{weatherLabel(t, now.condition)}</Text>
        </View>
      </View>

      <View style={styles.tiles}>
        <StatTile
          icon={<Droplets size={20} color={colors.info} />}
          tone="info"
          label={t('home.rain')}
          value={`${now.rainfallMm}`}
          unit={t('units.mm')}
        />
        <StatTile
          icon={<Droplets size={20} color={colors.primary} />}
          tone="success"
          label={t('home.humidity')}
          value={`${now.humidityPct}`}
          unit={t('units.percent')}
        />
        <StatTile
          icon={<Wind size={20} color={colors.textMuted} />}
          tone="neutral"
          label={t('home.wind')}
          value={`${now.windKph}`}
          unit={t('units.kmh')}
        />
      </View>

      <Text style={styles.forecastLabel}>{t('home.forecast')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.forecastRow}
      >
        {days.slice(0, 5).map((day) => (
          <View key={day.date} style={styles.day}>
            <Text style={styles.dayLabel}>{weekdayShort(day.date, i18n.language)}</Text>
            {weatherIcon(day.condition, 22, colors.primary)}
            <Text style={styles.dayTemp}>
              {Math.round(day.tempMaxC)}° / {Math.round(day.tempMinC)}°
            </Text>
            <View style={styles.dayRainRow}>
              {day.rainMm > 0 ? (
                <>
                  <Droplets size={12} color={colors.info} />
                  <Text style={styles.dayRain}>{day.rainMm} mm</Text>
                </>
              ) : (
                <Text style={styles.dayRainMuted}>—</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.subtitle,
    color: colors.text,
  },
  source: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: 'end',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroText: {
    gap: 2,
  },
  temp: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '700',
    color: colors.text,
  },
  tempUnit: {
    ...typography.subtitle,
    color: colors.textMuted,
    fontWeight: '500',
  },
  condition: {
    ...typography.body,
    color: colors.textMuted,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  forecastLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  forecastRow: {
    gap: spacing.sm,
  },
  day: {
    width: 72,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  dayLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  dayTemp: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  dayRainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 16,
  },
  dayRain: {
    ...typography.caption,
    color: colors.info,
  },
  dayRainMuted: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
