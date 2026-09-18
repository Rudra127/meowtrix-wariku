import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { AnswerCheck, LessonAnswer, PublicExercise } from '@/api/types';
import { AppText, PressableScale } from '@/components/ui';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { shuffleIndices } from './exerciseMeta';

type Props = {
  exercise: PublicExercise;
  value: LessonAnswer;
  onChange: (v: LessonAnswer) => void;
  onSubmit?: () => void;
  /** Result of "Check" — locks the input and colours right/wrong choices. */
  feedback?: AnswerCheck | null;
};

type Tone = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim';

/** Visual state of a choice once feedback is known. */
function choiceTone(selected: boolean, isCorrectChoice: boolean, feedback?: AnswerCheck | null): Tone {
  if (!feedback) return selected ? 'selected' : 'idle';
  if (isCorrectChoice) return 'correct';
  if (selected) return 'wrong';
  return 'dim';
}

/** Renders the right input for an exercise type. Mount with `key={index}` so local state resets per question. */
export function ExerciseInput({ exercise, value, onChange, onSubmit, feedback }: Props) {
  const locked = !!feedback;
  const set = locked ? () => {} : onChange;
  switch (exercise.type) {
    case 'multiple_choice':
      return <MultipleChoice options={exercise.options ?? []} value={value} onChange={set} feedback={feedback} />;
    case 'true_false':
      return <TrueFalse value={value} onChange={set} feedback={feedback} />;
    case 'fill_number':
      return <FillNumber value={value} onChange={set} onSubmit={onSubmit} feedback={feedback} />;
    case 'order_steps':
      return <OrderSteps options={exercise.options ?? []} value={value} onChange={set} feedback={feedback} />;
    default:
      return null;
  }
}

const TONE_STYLE: Record<Tone, { border: string; bg: string; key: string; keyText: string }> = {
  idle: { border: colors.border, bg: colors.surface, key: colors.surfaceMuted, keyText: colors.textMuted },
  selected: { border: colors.primary, bg: colors.accentSoft, key: colors.primary, keyText: colors.accent },
  correct: { border: colors.success, bg: colors.successSoft, key: colors.success, keyText: colors.textOnPrimary },
  wrong: { border: colors.danger, bg: colors.dangerSoft, key: colors.danger, keyText: colors.textOnPrimary },
  dim: { border: colors.border, bg: colors.surface, key: colors.surfaceMuted, keyText: colors.textSubtle },
};

function MultipleChoice({ options, value, onChange, feedback }: { options: string[]; value: LessonAnswer; onChange: (v: LessonAnswer) => void; feedback?: AnswerCheck | null }) {
  return (
    <View style={styles.list}>
      {options.map((label, i) => {
        const selected = value === i;
        const tone = choiceTone(selected, feedback?.correctAnswer === i, feedback);
        const t = TONE_STYLE[tone];
        return (
          <PressableScale
            key={`${i}-${label}`}
            onPress={() => onChange(i)}
            disabled={!!feedback}
            scaleTo={0.98}
            style={[styles.option, { borderColor: t.border, backgroundColor: t.bg }, tone === 'dim' && styles.dim]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!feedback }}
            accessibilityLabel={label}
          >
            <View style={[styles.key, { backgroundColor: t.key }]}>
              {tone === 'correct' || tone === 'wrong' ? (
                <Ionicons name={tone === 'correct' ? 'checkmark' : 'close'} size={18} color={t.keyText} />
              ) : (
                <AppText variant="bodyStrong" color={t.keyText}>
                  {String.fromCharCode(65 + i)}
                </AppText>
              )}
            </View>
            <AppText variant="body" style={styles.flex}>
              {label}
            </AppText>
            {tone === 'selected' && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
          </PressableScale>
        );
      })}
    </View>
  );
}

function TrueFalse({ value, onChange, feedback }: { value: LessonAnswer; onChange: (v: LessonAnswer) => void; feedback?: AnswerCheck | null }) {
  const items = [
    { label: 'True', v: true, icon: 'checkmark' as const, tint: colors.success, soft: colors.successSoft },
    { label: 'False', v: false, icon: 'close' as const, tint: colors.danger, soft: colors.dangerSoft },
  ];
  return (
    <View style={styles.tfRow}>
      {items.map(({ label, v, icon, tint, soft }) => {
        const selected = value === v;
        const tone = choiceTone(selected, feedback?.correctAnswer === v, feedback);
        const highlight = tone === 'selected' || tone === 'correct' || tone === 'wrong';
        const edge = tone === 'correct' ? colors.success : tone === 'wrong' ? colors.danger : tint;
        return (
          <PressableScale
            key={label}
            onPress={() => onChange(v)}
            disabled={!!feedback}
            containerStyle={styles.flex}
            style={[
              styles.tfCard,
              shadow.card,
              highlight && { borderColor: edge, backgroundColor: tone === 'wrong' ? colors.dangerSoft : tone === 'correct' ? colors.successSoft : soft },
              tone === 'dim' && styles.dim,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <View style={[styles.tfIcon, { backgroundColor: highlight ? edge : soft }]}>
              <Ionicons name={icon} size={28} color={highlight ? colors.textOnPrimary : tint} />
            </View>
            <AppText variant="heading">{label}</AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

function FillNumber({ value, onChange, onSubmit, feedback }: { value: LessonAnswer; onChange: (v: LessonAnswer) => void; onSubmit?: () => void; feedback?: AnswerCheck | null }) {
  const [raw, setRaw] = useState<string>(typeof value === 'number' ? String(value) : '');
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fillWrap}>
      <View
        style={[
          styles.fillCard,
          shadow.card,
          focused && styles.fillFocused,
          feedback && { borderColor: feedback.isCorrect ? colors.success : colors.danger, backgroundColor: feedback.isCorrect ? colors.successSoft : colors.dangerSoft },
        ]}
      >
        <TextInput
          editable={!feedback}
          value={raw}
          onChangeText={(text) => {
            const cleaned = text.replace(/[^0-9.,-]/g, '');
            setRaw(cleaned);
            const parsed = Number(cleaned.replace(/,/g, ''));
            onChange(cleaned.trim() !== '' && Number.isFinite(parsed) ? parsed : null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmit}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="0"
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          style={styles.fillInput}
          autoFocus
          accessibilityLabel="Your answer"
        />
      </View>
      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <AppText variant="caption">Numbers only — skip ₹ and commas.</AppText>
      </View>
    </View>
  );
}

function OrderSteps({ options, value, onChange, feedback }: { options: string[]; value: LessonAnswer; onChange: (v: LessonAnswer) => void; feedback?: AnswerCheck | null }) {
  // One shuffle per mount (the player remounts this per question via `key`).
  const [shuffled] = useState(() => shuffleIndices(options.length));
  const picked = Array.isArray(value) ? value : [];

  const toggle = (originalIndex: number) =>
    onChange(picked.includes(originalIndex) ? picked.filter((i) => i !== originalIndex) : [...picked, originalIndex]);

  return (
    <View style={styles.list}>
      <View style={styles.hint}>
        <Ionicons name="hand-left-outline" size={16} color={colors.textMuted} />
        <AppText variant="caption" style={styles.flex}>
          Tap the steps in order. Tap again to undo.
        </AppText>
        {picked.length > 0 && !feedback && (
          <PressableScale onPress={() => onChange([])} haptic={false} accessibilityRole="button">
            <AppText variant="caption" color={colors.primary} style={styles.bold}>
              Reset
            </AppText>
          </PressableScale>
        )}
      </View>
      {shuffled.map((originalIndex) => {
        const position = picked.indexOf(originalIndex);
        const selected = position >= 0;
        // After checking: green if this step sits in its correct slot, red otherwise.
        const correctOrder = Array.isArray(feedback?.correctAnswer) ? (feedback.correctAnswer as number[]) : null;
        const inRightSpot = correctOrder ? correctOrder[position] === originalIndex : false;
        const tone: Tone = feedback ? (inRightSpot ? 'correct' : 'wrong') : selected ? 'selected' : 'idle';
        const t = TONE_STYLE[tone];
        return (
          <PressableScale
            key={originalIndex}
            onPress={() => toggle(originalIndex)}
            disabled={!!feedback}
            scaleTo={0.98}
            style={[styles.option, { borderColor: t.border, backgroundColor: t.bg }]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={selected ? `Step ${position + 1}: ${options[originalIndex]}` : options[originalIndex]}
          >
            <View style={[styles.key, styles.round, selected ? { backgroundColor: t.key } : styles.keyEmpty]}>
              {selected ? (
                <AppText variant="bodyStrong" color={t.keyText}>
                  {position + 1}
                </AppText>
              ) : null}
            </View>
            <AppText variant="body" style={styles.flex}>
              {options[originalIndex]}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
  list: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dim: { opacity: 0.55 },
  key: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: { borderRadius: 17 },
  keyEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  tfRow: { flexDirection: 'row', gap: spacing.md },
  tfCard: {
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tfIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  fillWrap: { gap: spacing.md },
  fillCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
  },
  fillFocused: { borderColor: colors.primary },
  fillInput: { fontFamily: fonts.bold, fontSize: 40, color: colors.text, textAlign: 'center', paddingVertical: 0, outlineWidth: 0 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
