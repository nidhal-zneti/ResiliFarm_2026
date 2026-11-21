import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing, touchTarget, typography } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Optional leading icon element (e.g. a lucide icon). */
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the full width of its container. */
  fullWidth?: boolean;
};

/**
 * Large, friendly touch target. Height is fixed to the accessibility minimum
 * so it is comfortable for every user.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textOnPrimary : colors.primary}
        />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  primaryLabel: {
    color: colors.textOnPrimary,
  },
  secondaryLabel: {
    color: colors.primary,
  },
  ghostLabel: {
    color: colors.primary,
  },
  label: {
    ...typography.bodyStrong,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});
