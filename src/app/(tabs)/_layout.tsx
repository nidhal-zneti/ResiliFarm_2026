import { Tabs } from 'expo-router';
import { CalendarDays, Sprout, User, Wheat } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { colors, typography } from '@/theme';

/** Bottom navigation: exactly four farmer destinations, nothing more. */
export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: typography.caption.fontSize,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color, size }) => <Wheat size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="farm"
        options={{
          title: t('nav.farm'),
          tabBarIcon: ({ color, size }) => <Sprout size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('nav.schedule'),
          tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
