import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getNotifications } from '@/api/notifications';
import { AlertBanner } from '@/components/AlertBanner';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateView';
import { useAsync } from '@/hooks/useAsync';
import { colors, radius, spacing, touchTarget, typography } from '@/theme';
import { alertIcon } from '@/utils/alertIcon';

/** Opened from the Home bell icon. Modal presentation. */
export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(getNotifications, []);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('notifications.title')}</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={styles.close}
          hitSlop={8}
        >
          <X size={22} color={colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState code={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Text style={styles.empty}>{t('notifications.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {data.map((notification) => (
            <AlertBanner
              key={notification.id}
              tone={notification.tone}
              title={notification.title}
              message={notification.message}
              icon={alertIcon(notification.tone)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  close: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: spacing.md,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
