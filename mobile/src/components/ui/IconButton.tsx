import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, themed } from '@/theme';
import { PressableScale } from './PressableScale';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tone = 'surface' | 'muted' | 'dark' | 'glass' | 'accent';

const TONES: Record<Tone, { bg: string; fg: string }> = themed(() => ({
  surface: { bg: colors.surface, fg: colors.text },
  muted: { bg: colors.surfaceMuted, fg: colors.text },
  dark: { bg: colors.ink, fg: colors.onInk },
  glass: { bg: 'rgba(255,255,255,0.12)', fg: colors.textOnPrimary }, // on primary/dark surfaces
  accent: { bg: colors.accent, fg: colors.textOnAccent },
}));

type Props = {
  icon: IconName;
  onPress?: () => void;
  tone?: Tone;
  size?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ icon, onPress, tone = 'surface', size = 44, accessibilityLabel, disabled, style }: Props) {
  const t = TONES[tone];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={t.fg} />
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
}));
