import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme';

type Props = ViewProps & { tone?: 'surface' | 'primary' | 'muted'; elevated?: boolean };

export function Card({ tone = 'surface', elevated = false, style, ...rest }: Props) {
  return <View style={[styles.base, styles[tone], elevated && shadow.card, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  surface: { backgroundColor: colors.surface },
  primary: { backgroundColor: colors.primary },
  muted: { backgroundColor: colors.surfaceMuted },
});
