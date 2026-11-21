import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, StatusTone, toneStyles, typography } from '@/theme';

type AlertBannerProps = {
  tone: StatusTone;
  title: string;
  message?: string;
  icon?: ReactNode;
  /** Optional call-to-action rendered as a link-style row. */
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Plain-language alert card used for risks and warnings ("Rain expected
 * tomorrow", "Water availability is low"...). No charts, no jargon.
 */
export function AlertBanner({
  tone,
  title,
  message,
  icon,
  actionLabel,
  onAction,
}: AlertBannerProps) {
  const { bg, fg } = toneStyles[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.body}>
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.action, { color: fg }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  icon: {
    paddingTop: 2,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
  },
  message: {
    ...typography.small,
    color: colors.text,
  },
  action: {
    ...typography.small,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
});
