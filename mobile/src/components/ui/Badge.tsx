import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, radius, spacing, themed } from '@/theme';
import { AppText } from './AppText';
import type { IconName } from './IconButton';

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'glass';

const TONES: Record<Tone, { bg: string; fg: string }> = themed(() => ({
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
  accent: { bg: colors.accent, fg: colors.textOnAccent },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  glass: { bg: 'rgba(255,255,255,0.14)', fg: colors.textOnPrimary },
}));

export function Badge({ label, tone = 'neutral', icon, style }: { label: string; tone?: Tone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }, style]}>
      {icon && <Ionicons name={icon} size={12} color={t.fg} />}
      <AppText variant="caption" color={t.fg} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  text: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
}));
