import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { CategoryId, TransactionType } from '@/api/types';
import { AppText, Badge, IconButton, PressableScale } from '@/components/ui';
import { currencySymbol } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { categoryMeta, categoryOptions, defaultCategory } from './categories';
import type { EditableDraft } from './useVoiceCapture';
import { relativeDate } from './dates';

type Props = {
  draft: EditableDraft;
  currency: string;
  onToggle: () => void;
  onChange: (patch: Partial<EditableDraft>) => void;
  onRemove: () => void;
};

/**
 * One AI-extracted transaction awaiting confirmation.
 *
 * Tapping the row toggles whether it will be saved; tapping the amount or category opens inline
 * editing. Rows the model was unsure about are outlined so the eye goes straight to them.
 */
export function DraftRow({ draft, currency, onToggle, onChange, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(() => (draft.amount / 100).toString());
  const meta = categoryMeta(draft.category, draft.type);

  const commitAmount = () => {
    const value = Number.parseFloat(amountText.replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) {
      onChange({ amount: Math.round(value * 100) });
    } else {
      setAmountText((draft.amount / 100).toString()); // revert
    }
  };

  const switchType = (type: TransactionType) => {
    // Switching direction invalidates the category, so reset it to that type's default.
    onChange({ type, category: defaultCategory(type) });
  };

  return (
    <View style={[styles.wrap, draft.needsReview && styles.wrapReview, !draft.selected && styles.wrapMuted]}>
      <View style={styles.row}>
        <PressableScale
          onPress={onToggle}
          scaleTo={0.9}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: draft.selected }}
          accessibilityLabel={`${draft.selected ? 'Exclude' : 'Include'} ${draft.title || meta.label}`}
          style={[styles.check, draft.selected && styles.checkOn]}
        >
          {draft.selected && <Ionicons name="checkmark" size={16} color={colors.primary} />}
        </PressableScale>

        <View style={[styles.icon, { backgroundColor: meta.soft }]}>
          <Ionicons name={meta.icon} size={18} color={meta.color} />
        </View>

        <View style={styles.flex}>
          <TextInput
            value={draft.title}
            onChangeText={(title) => onChange({ title })}
            placeholder={meta.label}
            placeholderTextColor={colors.textSubtle}
            style={styles.title}
            accessibilityLabel="Description"
          />
          <AppText variant="caption" numberOfLines={1}>
            {meta.label} · {relativeDate(draft.date)}
          </AppText>
        </View>

        <PressableScale onPress={() => setEditing((e) => !e)} scaleTo={0.95} accessibilityLabel="Edit amount">
          <AppText variant="bodyStrong" color={draft.type === 'income' ? colors.success : colors.text} style={styles.amount}>
            {draft.type === 'income' ? '+' : '-'}
            {currencySymbol(currency).trim()}
            {(draft.amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </AppText>
        </PressableScale>

        <IconButton icon="close" tone="muted" size={28} onPress={onRemove} accessibilityLabel="Remove" />
      </View>

      {draft.needsReview && !editing && (
        <Badge tone="warning" icon="alert-circle" label="Worth double-checking" style={styles.badge} />
      )}

      {editing && (
        <View style={styles.editor}>
          <View style={styles.amountRow}>
            <AppText style={styles.symbol} color={colors.textMuted}>
              {currencySymbol(currency).trim()}
            </AppText>
            <TextInput
              value={amountText}
              onChangeText={(t) => setAmountText(t.replace(/[^0-9.]/g, ''))}
              onBlur={commitAmount}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              autoFocus
              selectTextOnFocus
              accessibilityLabel="Amount"
            />
          </View>

          <View style={styles.types}>
            {(['expense', 'income'] as const).map((type) => (
              <PressableScale
                key={type}
                onPress={() => switchType(type)}
                style={[styles.typeChip, draft.type === type && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.type === type }}
              >
                <AppText variant="caption" color={draft.type === type ? colors.textOnPrimary : colors.text} style={styles.chipText}>
                  {type === 'expense' ? 'Expense' : 'Income'}
                </AppText>
              </PressableScale>
            ))}
          </View>

          <View style={styles.chips}>
            {categoryOptions(draft.type).map((option) => {
              const active = option.id === draft.category;
              return (
                <PressableScale
                  key={option.id}
                  onPress={() => onChange({ category: option.id as CategoryId })}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={option.icon} size={13} color={active ? colors.accent : option.color} />
                  <AppText variant="caption" color={active ? colors.textOnPrimary : colors.text} style={styles.chipText}>
                    {option.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>

          <PressableScale
            onPress={() => {
              commitAmount();
              setEditing(false);
            }}
            style={styles.done}
            accessibilityRole="button"
            accessibilityLabel="Done editing"
          >
            <AppText variant="caption" color={colors.primary} style={styles.chipText}>
              Done
            </AppText>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  wrapReview: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  wrapMuted: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, padding: 0 },
  amount: { fontFamily: fonts.bold },
  badge: { marginLeft: 32 },
  editor: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  symbol: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 30 },
  amountInput: {
    fontFamily: fonts.bold,
    fontSize: 30,
    color: colors.text,
    minWidth: 70,
    textAlign: 'center',
    paddingVertical: 0,
  },
  types: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  typeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 32,
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 32,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.semibold },
  done: { alignSelf: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.lg },
});
