import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing, themed } from '@/theme';
import { AppText } from './AppText';

/** Form-level (non-field) error banner. Renders nothing when `message` is empty. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <AppText variant="caption" color={colors.danger} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  text: { flex: 1 },
}));
