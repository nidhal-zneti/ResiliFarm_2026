import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { restoreLocale } from '@/hooks/useLocale';
// Initialise i18n before any screen renders.
import i18n from '@/i18n';
import { colors } from '@/theme';
import { applyRTL } from '@/utils/rtl';

export default function RootLayout() {
  useEffect(() => {
    // Restore the language chosen on a previous run.
    restoreLocale().then((saved) => {
      if (saved) {
        i18n.changeLanguage(saved);
        applyRTL(saved);
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
