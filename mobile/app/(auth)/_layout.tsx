import { Stack } from 'expo-router';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() {
  // Screens draw their own hero + back button (features/auth/AuthLayout).
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.primary } }} />;
}
