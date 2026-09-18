import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, spacing } from '@/theme';
import { AppText } from './AppText';

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <AppText variant="subheading" style={styles.title}>
        {title}
      </AppText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <AppText variant="caption" color={colors.primary} style={styles.action}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  title: { fontFamily: fonts.bold },
  action: { fontFamily: fonts.bold },
});
