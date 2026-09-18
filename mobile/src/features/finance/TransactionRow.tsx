import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { relativeDate } from './dates';
import { categories, type Transaction } from './sampleData';

export function TransactionRow({ tx, currency }: { tx: Transaction; currency: string }) {
  const cat = categories[tx.category];
  const income = tx.amount > 0;
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: cat.soft }]}>
        <Ionicons name={cat.icon} size={20} color={cat.color} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {tx.title}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {cat.label} · {relativeDate(tx.date)}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color={income ? colors.success : colors.text} style={styles.amount}>
        {formatMoney(tx.amount, currency, { showPlus: true })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  amount: { fontFamily: fonts.bold },
});
