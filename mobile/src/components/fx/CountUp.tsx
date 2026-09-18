import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type TextStyle } from 'react-native';
import { AppText } from '@/components/ui';
import type { TypographyVariant } from '@/theme';

type Props = {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  variant?: TypographyVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Number that counts up to `to` — for XP gains and scores. */
export function CountUp({ to, from = 0, duration = 900, delay = 150, prefix = '', suffix = '', variant = 'heading', color, style }: Props) {
  const [value] = useState(() => new Animated.Value(from));
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    const id = value.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(value, { toValue: to, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => value.removeListener(id);
  }, [to, duration, delay, value]);

  return (
    <AppText variant={variant} color={color} style={style}>
      {prefix}
      {display}
      {suffix}
    </AppText>
  );
}
