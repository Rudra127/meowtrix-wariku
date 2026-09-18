import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

/** Form-level (non-field) error banner. Renders nothing when `message` is empty. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
  text: { color: colors.danger, fontSize: 14 },
});
