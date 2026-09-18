import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: 'index' };

type IconName = React.ComponentProps<typeof Ionicons>['name'];
function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  // First authenticated call: verifies the Clerk session with our backend and creates the
  // user's Mongo record on first sign-in. Screens read the cached result via useCurrentUser().
  useCurrentUser();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Learn', tabBarIcon: icon('school-outline') }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: icon('wallet-outline') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask AI', tabBarIcon: icon('sparkles-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
