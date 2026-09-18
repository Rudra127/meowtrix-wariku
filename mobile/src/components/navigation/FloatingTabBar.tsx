import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { colors, fonts, motion, radius, shadow, spacing } from '@/theme';

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
              // Spring the active pill's width change (critically damped — no wobble).
              LayoutAnimation.configureNext({
                duration: 320,
                update: { type: LayoutAnimation.Types.spring, springDamping: 0.85 },
                create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 180 },
                delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 120 },
              });
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
              <TabIcon focused={focused}>{options.tabBarIcon?.({ focused, color, size: 22 })}</TabIcon>
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

/** Icon that gives a small spring "pop" when its tab becomes active. */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!focused) return;
    scale.setValue(0.78);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.spring.pop }).start();
  }, [focused, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
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
