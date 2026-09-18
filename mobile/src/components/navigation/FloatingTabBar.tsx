import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

/**
 * Floating dark-green pill tab bar. The active tab expands into a lime pill with its label.
 * Icons/titles come from each <Tabs.Screen options>. Hidden while the keyboard is open.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  if (keyboardVisible) return null;

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={[styles.bar, shadow.floating]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const color = focused ? colors.textOnAccent : colors.textOnPrimaryMuted;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              Haptics.selectionAsync().catch(() => {});
              LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={[styles.item, focused && styles.itemActive]}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              {focused && (
                <AppText variant="caption" color={color} style={styles.label} numberOfLines={1}>
                  {label}
                </AppText>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: spacing.xl, right: spacing.xl, alignItems: 'center', pointerEvents: 'box-none' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    padding: 6,
    gap: 4,
    width: '100%',
    maxWidth: 420,
  },
  item: {
    height: 52,
    minWidth: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
  },
  itemActive: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, flexGrow: 1 },
  label: { fontFamily: fonts.bold, fontSize: 14 },
});
