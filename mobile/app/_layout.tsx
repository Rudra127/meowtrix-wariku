/**
 * Root layout — providers + the single place where auth decides what the user can see.
 *
 *   signed out                → (auth) group: sign-in, sign-up, forgot-password
 *   signed in, not onboarded  → (onboarding): level + goal questionnaire
 *   signed in, onboarded      → (tabs) group: Learn, Money, Ask AI, Profile
 *
 * `Stack.Protected` swaps groups automatically whenever Clerk's session changes, so screens
 * never need to navigate after sign-in/sign-out themselves.
 */
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { queryClient } from '@/api/queryClient';
import { CLERK_PUBLISHABLE_KEY } from '@/config/env';
import { BrandMark } from '@/features/auth/BrandMark';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { colors, spacing } from '@/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!CLERK_PUBLISHABLE_KEY) return <MissingConfig />;

  return (
    // tokenCache = expo-secure-store: keeps users signed in across app restarts (encrypted).
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <RootNavigator fontsLoaded={fontsLoaded} />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoaded, isSignedIn, userId } = useAuth();

  // Different user (or signed out) → drop every cached server response from the previous user.
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current !== userId) {
      queryClient.clear();
      previousUserId.current = userId;
    }
  }, [userId]);

  // Backend user decides onboarding. If the backend is unreachable we don't block the app —
  // users land in the tabs (Profile shows the connection error) and see onboarding next time.
  const me = useCurrentUser();
  const needsOnboarding = !!isSignedIn && me.data?.isOnboarded === false;

  if (!isLoaded || !fontsLoaded || (isSignedIn && me.isLoading)) return <Splash />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!!isSignedIn && !needsOnboarding}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lesson/[slug]" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="practice/[slug]" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* OAuth deep-link landing route; must be reachable in both states. */}
      <Stack.Screen name="sso-callback" />
    </Stack>
  );
}

function Splash() {
  return (
    <View style={[styles.center, { backgroundColor: colors.primary }]}>
      <StatusBar style="light" />
      <BrandMark size={64} />
      <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
    </View>
  );
}

// Rendered before fonts/providers exist, so it uses plain Text on purpose.
function MissingConfig() {
  return (
    <View style={[styles.center, styles.padded]}>
      <Text style={styles.heading}>Clerk key missing</Text>
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
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
});
