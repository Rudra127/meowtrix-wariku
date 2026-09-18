import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Amount, Card, SegmentedControl } from '@/components/ui';
import { formatCompact } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { spending, type Period } from './sampleData';

const PERIODS = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
] as const;

const CHART_HEIGHT = 150;

/** Spending bars with period switcher. Bars grow in on change; tap one to inspect it. */
export function SpendingChart({ currency }: { currency: string }) {
  const [period, setPeriod] = useState<Period>('week');
  const data = spending[period];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card elevated style={styles.card}>
      <View style={styles.head}>
        <View>
          <AppText variant="label">Spending this {period}</AppText>
          <Amount minor={total} currency={currency} size={26} />
        </View>
      </View>
      <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
      {/* key → remount so bars re-animate from zero when the period changes */}
      <Bars key={period} data={data} currency={currency} />
    </Card>
  );
}

function Bars({ data, currency }: { data: { label: string; value: number }[]; currency: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const [selected, setSelected] = useState(peak);
  const anims = useMemo(() => data.map(() => new Animated.Value(0)), [data]);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    Animated.stagger(
      40,
      anims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 })),
    ).start();
  }, [anims]);

  return (
    <View style={styles.chart}>
      {data.map((d, i) => {
        const active = i === selected;
        const h = Math.max(6, (d.value / max) * CHART_HEIGHT);
        return (
          <Pressable
            key={`${d.label}-${i}`}
            style={styles.col}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSelected(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${d.label}: ${formatCompact(d.value, currency)}`}
          >
            <View style={styles.valueSlot}>
              {active && d.value > 0 && (
                <View style={styles.tip}>
                  <AppText variant="caption" color={colors.textOnPrimary} style={styles.tipText} numberOfLines={1}>
                    {formatCompact(d.value, currency)}
                  </AppText>
                </View>
              )}
            </View>
            <View style={[styles.track, { height: CHART_HEIGHT }]}>
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: active ? colors.primary : d.value ? colors.mint : colors.surfaceMuted,
                    transform: [{ scaleY: anims[i] }],
                  },
                ]}
              />
            </View>
            <AppText variant="caption" color={active ? colors.text : colors.textSubtle} style={active && styles.activeLabel}>
              {d.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg, padding: spacing.xl },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  col: { flex: 1, alignItems: 'center', gap: spacing.xs },
  valueSlot: { height: 26, justifyContent: 'flex-end', alignItems: 'center', overflow: 'visible' },
  tip: { backgroundColor: colors.ink, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, minWidth: 44, alignItems: 'center' },
  tipText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
  track: { width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '78%', maxWidth: 30, borderRadius: 8, transformOrigin: 'bottom' },
  activeLabel: { fontFamily: fonts.bold },
});
