import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import MapView, { Marker, UrlTile } from 'react-native-maps';
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

  const coordinate = { latitude, longitude };
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
      <MapView
        style={styles.map}
        mapType="none"
        initialRegion={{
          ...coordinate,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
      >
        <UrlTile
          urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"
          maximumZ={20}
          flipY={false}
        />
        <Marker coordinate={coordinate} title={name} description={location} />
      </MapView>
      <Pressable onPress={openMap} style={styles.attribution}>
        <Text style={styles.attributionText}>© OpenStreetMap contributors © CARTO</Text>
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
  map: {
    height: 220,
  },
  attribution: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  attributionText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
