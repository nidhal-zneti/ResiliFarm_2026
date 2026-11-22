import { createElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/Card';
import { colors, spacing, typography } from '@/theme';

type FarmMapCardProps = {
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
};

export function FarmMapCard({ name, location, latitude, longitude }: FarmMapCardProps) {
  const { t } = useTranslation();
  if (latitude == null || longitude == null) return null;

  const openMap = () => {
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`,
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.farmLocation')}</Text>
        <Pressable onPress={openMap}>
          <Text style={styles.openMap}>{t('home.openMap')}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={openMap} style={styles.mapPreview}>
        {createElement('iframe', {
          title: `${name} - ${location}`,
          src: `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.12}%2C${latitude - 0.08}%2C${longitude + 0.12}%2C${latitude + 0.08}&layer=mapnik&marker=${latitude}%2C${longitude}`,
          style: { width: '100%', height: '220px', border: 0, pointerEvents: 'none' },
        })}
        <View style={styles.locationLabel}>
          <Text style={styles.location}>{location}</Text>
          <Text style={styles.coordinates}>{latitude.toFixed(4)}, {longitude.toFixed(4)}</Text>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  openMap: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  mapPreview: {
    height: 220,
    overflow: 'hidden',
    backgroundColor: '#EAF4EC',
  },
  webView: {
    height: 220,
    backgroundColor: '#EAF4EC',
  },
  locationLabel: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  location: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  coordinates: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
