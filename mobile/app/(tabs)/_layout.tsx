import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { colors, useTheme } from '@/theme';

export const unstable_settings = { initialRouteName: 'index' };

type IconName = React.ComponentProps<typeof Ionicons>['name'];
function icon(outline: IconName, filled: IconName) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  useTheme(); // re-render on light/dark switch
  // First authenticated call: verifies the Clerk session with our backend and creates the
  // user's Mongo record on first sign-in. Screens read the cached result via useCurrentUser().
  useCurrentUser();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      // 'shift' = a soft crossfade with a few dp of horizontal drift toward the tab you picked.
      screenOptions={{ headerShown: false, animation: 'shift', sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Learn', tabBarIcon: icon('school-outline', 'school') }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: icon('wallet-outline', 'wallet') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask AI', tabBarIcon: icon('sparkles-outline', 'sparkles') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
