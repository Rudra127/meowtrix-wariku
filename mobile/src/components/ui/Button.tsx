import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, themed } from '@/theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'brand' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = themed(() => ({
  primary: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
  brand: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.textOnAccent, border: colors.accent },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
}));

/** Pill button. `primary` = black CTA, `brand` = green, `accent` = lime (use on dark surfaces). */
export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, icon, style, containerStyle }: Props) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      containerStyle={containerStyle}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: v.bg, borderColor: v.border },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <AppText variant="bodyStrong" color={v.fg} style={size === 'sm' && styles.smText}>
            {title}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  base: { borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 54, paddingHorizontal: spacing.xl },
  sm: { minHeight: 38, paddingHorizontal: spacing.lg },
  smText: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disabled: { opacity: 0.45 },
}));
