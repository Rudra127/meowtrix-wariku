import { Stack } from 'expo-router';
import { colors } from '@/theme';

// Every route group referenced by a <Stack.Screen name="(group)"> in app/_layout.tsx needs its own
// _layout — without it the group isn't a navigator and the root guard has nothing to show.
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
