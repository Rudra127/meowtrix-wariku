import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './AppText';

type Props = { value: string; onChange: (v: string) => void; length?: number; error?: string | null; onComplete?: (code: string) => void };

/** 6-box one-time-code input. A single hidden TextInput keeps SMS/email autofill working. */
export function CodeInput({ value, onChange, length = 6, error, onComplete }: Props) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  return (
    <View style={styles.container}>
      <Pressable style={styles.row} onPress={() => ref.current?.focus()} accessibilityLabel="Verification code">
        {Array.from({ length }, (_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          return (
            <View key={i} style={[styles.box, active && styles.active, !!error && styles.errored]}>
              <AppText style={styles.digit}>{value[i] ?? ''}</AppText>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        style={styles.hidden}
        caretHidden
      />
      {!!error && (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { borderColor: colors.primary, backgroundColor: colors.surface },
  errored: { borderColor: colors.danger },
  digit: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
