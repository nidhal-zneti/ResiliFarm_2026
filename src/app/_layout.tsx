import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getToken, subscribeToken } from '@/api/session';
import { restoreLocale } from '@/hooks/useLocale';
// Initialise i18n before any screen renders.
import i18n from '@/i18n';
import { colors } from '@/theme';
import { applyRTL } from '@/utils/rtl';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Restore the language chosen on a previous run.
    restoreLocale().then((saved) => {
      if (saved) {
        i18n.changeLanguage(saved);
        applyRTL(saved);
      }
    });

    // Decide which group to show once we know whether a session exists.
    let mounted = true;
    getToken().then((token) => {
      if (!mounted) return;
      setAuthed(Boolean(token));
      setReady(true);
    });
    // React to sign-in / sign-out / expired sessions.
    const unsubscribe = subscribeToken((token) => setAuthed(Boolean(token)));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!ready) {
    return <View style={styles.loading} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={authed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!authed}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
