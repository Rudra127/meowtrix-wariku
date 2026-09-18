import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText, PressableScale, type IconName } from '@/components/ui';
import { colors, radius, spacing, themed } from '@/theme';

type Props = {
  icon: IconName;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'danger';
};

export function SettingsRow({ icon, label, value, right, onPress, tone = 'default' }: Props) {
  const danger = tone === 'danger';
  const content = (
    <>
      <View style={[styles.icon, danger && styles.iconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.brand} />
      </View>
      <AppText variant="bodyStrong" color={danger ? colors.danger : colors.text} style={styles.label}>
        {label}
      </AppText>
      {right ?? (
        <View style={styles.right}>
          {!!value && <AppText variant="caption">{value}</AppText>}
          {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />}
        </View>
      )}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.row} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  icon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconDanger: { backgroundColor: colors.dangerSoft },
  label: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
