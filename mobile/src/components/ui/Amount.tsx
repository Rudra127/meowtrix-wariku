import { StyleSheet, Text } from 'react-native';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import { moneyParts } from '@/lib/format';
import { colors, fonts } from '@/theme';

type Props = {
  /** Integer minor units (paise/cents). */
  minor: number;
  currency?: string;
  size?: number;
  color?: string;
  /** Color for the decimals — muted for the signature "₹1,24,560.40" look. */
  fractionColor?: string;
  hidden?: boolean;
  showPlus?: boolean;
  /** Count smoothly to new values (balances, totals). */
  animate?: boolean;
};

/** Big money number with muted decimals. */
export function Amount({ minor, currency = 'INR', size = 36, color = colors.text, fractionColor, hidden, showPlus, animate }: Props) {
  const animated = useAnimatedNumber(minor);
  const p = moneyParts(animate ? animated : minor, currency, { showPlus });
  const base = { fontSize: size, lineHeight: size * 1.15, letterSpacing: size > 24 ? -1 : -0.3, color };
  if (hidden) {
    return <Text style={[styles.text, base]}>{`${p.symbol}••••••`}</Text>;
  }
  return (
    <Text style={[styles.text, base]} accessibilityLabel={`${p.sign}${p.symbol}${p.whole}${p.fraction}`}>
      <Text style={styles.symbol}>{`${p.sign}${p.symbol}`}</Text>
      {p.whole}
      <Text style={{ color: fractionColor ?? colors.textSubtle }}>{p.fraction}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.bold },
  symbol: { fontFamily: fonts.semibold },
});
