import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import type { Transaction } from '@/api/types';
import { AppText, PressableScale } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { colors, fonts, radius, spacing, themed } from '@/theme';
import { SOURCE_LABELS, categoryMeta, signedAmount } from './categories';
import { relativeDate } from './dates';

type Props = { tx: Transaction; currency: string; onPress?: () => void };

export function TransactionRow({ tx, currency, onPress }: Props) {
  const meta = categoryMeta(tx.category, tx.type);
  const income = tx.type === 'income';
  // The API stores `amount` positive with a separate `type`; the sign is a display concern.
  const amount = signedAmount(tx);
  const source = SOURCE_LABELS[tx.source];

  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: meta.soft }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {tx.title || meta.label}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="caption" numberOfLines={1}>
            {meta.label} · {relativeDate(tx.date)}
          </AppText>
          {/* Shows at a glance which entries the user didn't type themselves. */}
          {source && <Ionicons name={source.icon} size={11} color={colors.textSubtle} />}
        </View>
      </View>
      <AppText variant="bodyStrong" color={income ? colors.success : colors.text} style={styles.amount}>
        {formatMoney(amount, currency, { showPlus: true })}
      </AppText>
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${tx.title || meta.label}, ${formatMoney(amount, currency)}`}
    >
      {content}
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  amount: { fontFamily: fonts.bold },
}));
