import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText, PressableScale, type IconName } from '@/components/ui';
import { colors, radius, shadow, spacing } from '@/theme';

type Props = { icon: IconName; label: string; description: string; selected: boolean; onPress: () => void };

export function OptionCard({ icon, label, description, selected, onPress }: Props) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${description}`}
      style={[styles.card, shadow.card, selected && styles.selected]}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <Ionicons name={icon} size={22} color={selected ? colors.accent : colors.primary} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption">{description}</AppText>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <Ionicons name="checkmark" size={14} color={colors.accent} />}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  icon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: colors.primary },
  text: { flex: 1, gap: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
