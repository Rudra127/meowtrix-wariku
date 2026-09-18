/**
 * Landing route for `wariku://broker-callback` (Upstox, Zerodha, any broker).
 *
 * Normally unused: `WebBrowser.openAuthSessionAsync` intercepts the redirect and closes the browser
 * itself, so the Profile screen handles the result inline. This route is the safety net for when the
 * OS hands the deep link to the app instead — e.g. the user finished signing in after the in-app
 * browser was dismissed, or the broker opened in the system browser.
 *
 * It only refreshes the cached integration status and bounces back to Profile; the connection was
 * already completed server-side before this link was ever emitted.
 */
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { queryKeys } from '@/api/queryClient';
import { AppText } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function BrokerCallback() {
  const { status } = useLocalSearchParams<{ status?: string; provider?: string }>();
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
    const timer = setTimeout(() => router.replace('/(tabs)/profile'), 600);
    return () => clearTimeout(timer);
  }, [queryClient]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText variant="bodyStrong">{status === 'connected' ? 'Connected' : 'Finishing up…'}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
});
