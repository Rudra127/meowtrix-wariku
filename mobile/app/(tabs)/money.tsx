// Money tab — personal finance management. Spec: docs/ROADMAP.md → "Money".
// Build the real screen under src/features/finance/ and render it here.
import { ComingSoon } from '@/components/ComingSoon';

export default function MoneyScreen() {
  return (
    <ComingSoon
      icon="wallet-outline"
      title="Money"
      tagline="See where your money goes and plan where it should."
      planned={['Accounts and transactions', 'Monthly budgets by category', 'Savings goals with progress']}
    />
  );
}
