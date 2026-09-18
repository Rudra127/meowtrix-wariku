import { Stack } from 'expo-router';
import { colors, useTheme } from '@/theme';

export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() {
  useTheme(); // re-render on light/dark switch
  // Screens draw their own hero + back button (features/auth/AuthLayout).
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.primary } }} />;
}
