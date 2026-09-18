/**
 * Root layout — providers + the single place where auth decides what the user can see.
 *
 *   signed out → (auth) group: sign-in, sign-up, forgot-password
 *   signed in  → (tabs) group: Learn, Money, Ask AI, Profile
 *
 * `Stack.Protected` swaps groups automatically whenever Clerk's session changes, so screens
 * never need to navigate after sign-in/sign-out themselves.
 */
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { queryClient } from '@/api/queryClient';
import { CLERK_PUBLISHABLE_KEY } from '@/config/env';
import { colors, spacing, typography } from '@/theme';

export default function RootLayout() {
  if (!CLERK_PUBLISHABLE_KEY) return <MissingConfig />;

  return (
    // tokenCache = expo-secure-store: keeps users signed in across app restarts (encrypted).
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <RootNavigator />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function RootNavigator() {
  const { isLoaded, isSignedIn, userId } = useAuth();

  // Different user (or signed out) → drop every cached server response from the previous user.
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current !== userId) {
      queryClient.clear();
      previousUserId.current = userId;
    }
  }, [userId]);

  if (!isLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!isSignedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* OAuth deep-link landing route; must be reachable in both states. */}
      <Stack.Screen name="sso-callback" />
    </Stack>
  );
}

function MissingConfig() {
  return (
    <View style={[styles.center, styles.padded]}>
      <Text style={typography.heading}>Clerk key missing</Text>
      <Text style={styles.muted}>
        Copy mobile/.env.example to mobile/.env, set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, then restart with
        `npm run start:clear`.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  padded: { padding: spacing.xl, gap: spacing.md },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
