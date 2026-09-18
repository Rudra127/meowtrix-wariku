import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius, shadow } from '@/theme';
import { AppText } from './AppText';

type Props<T extends string> = {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
};

const PAD = 4;

/** Pill segmented control with a sliding thumb (Day / Week / Month …). */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width ? (width - PAD * 2) / options.length : 0;
  const [x] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(x, { toValue: index * segment, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [index, segment, x]);

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {segment > 0 && (
        <Animated.View style={[styles.thumb, shadow.card, { width: segment, transform: [{ translateX: x }] }]} />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
          >
            <AppText variant="caption" color={active ? colors.text : colors.textMuted} style={active && styles.activeText}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, padding: PAD },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: radius.pill, backgroundColor: colors.surface },
  item: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  activeText: { fontFamily: fonts.bold },
});
