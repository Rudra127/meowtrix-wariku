import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, isDark, radius, spacing, themed } from '@/theme';
import { AppText } from './AppText';
import type { IconName } from './IconButton';

type Props = TextInputProps & { label: string; error?: string | null; icon?: IconName };

/** Filled input with label, optional leading icon, focus ring, and a show/hide toggle for passwords. */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, icon, secureTextEntry, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isPassword = !!secureTextEntry;

  return (
    <View style={styles.container}>
      <AppText variant="caption" color={colors.text} style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.field, focused && styles.focused, !!error && styles.errored]}>
        {icon && <Ionicons name={icon} size={18} color={focused ? colors.brand : colors.textMuted} />}
        <TextInput
          keyboardAppearance={isDark() ? 'dark' : 'light'}
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.brand}
          style={[styles.input, style]}
          accessibilityLabel={label}
          secureTextEntry={isPassword && hidden}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {!!error && (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
});

const styles = themed(() => StyleSheet.create({
  container: { gap: spacing.xs + 2 },
  label: { fontFamily: fonts.semibold },
  field: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  focused: { backgroundColor: colors.surface, borderColor: colors.brand },
  errored: { borderColor: colors.danger },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text, paddingVertical: spacing.md },
}));
