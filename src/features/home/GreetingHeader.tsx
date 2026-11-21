import { Bell, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, touchTarget, typography } from '@/theme';

type GreetingHeaderProps = {
  name: string;
  farmName: string;
  location: string;
  unreadCount?: number;
  onOpenNotifications: () => void;
};

/** "Hello, Ahmed" + farm location, with the notifications bell. */
export function GreetingHeader({
  name,
  farmName,
  location,
  unreadCount = 0,
  onOpenNotifications,
}: GreetingHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.greeting} numberOfLines={1}>
          {t('home.greeting', { name })}
        </Text>
        <View style={styles.farmRow}>
          <MapPin size={14} color={colors.textMuted} />
          <Text style={styles.farm} numberOfLines={1}>
            {farmName} · {location}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onOpenNotifications}
        accessibilityRole="button"
        accessibilityLabel={t('nav.notifications')}
        style={styles.bell}
        hitSlop={8}
      >
        <Bell size={22} color={colors.text} />
        {unreadCount > 0 ? <View style={styles.dot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  textCol: {
    flex: 1,
    gap: spacing.xs,
  },
  greeting: {
    ...typography.title,
    color: colors.text,
  },
  farmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  farm: {
    ...typography.small,
    color: colors.textMuted,
    flexShrink: 1,
  },
  bell: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 12,
    end: 12,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
});
