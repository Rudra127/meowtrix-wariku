/**
 * React Query hooks for the Money tab.
 *
 * Every mutation invalidates `queryKeys.finance.all` rather than a narrower key: one new expense
 * changes the balance, the month summary, the chart and the transaction list, so refreshing them
 * together is both correct and simpler than tracking which views a write touched.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { financeApi, integrationsApi, voiceApi, type TransactionFilters } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { ExpenseCategory, SeriesPeriod, TransactionInput, TransactionSource } from '@/api/types';
import { useApi } from '@/api/useApi';

/** Invalidates everything money-related. Use after any write. */
export function useRefreshFinance() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
    [queryClient],
  );
}

export function useFinanceSummary(month?: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.finance.summary(month),
    queryFn: () => financeApi.summary(api, month),
  });
}

export function useFinanceSeries(period: SeriesPeriod, month?: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.finance.series(period, month),
    queryFn: () => financeApi.series(api, period, month),
    // Switching Week/Month/Year should feel instant, so keep the old bars while the new ones load.
    placeholderData: (previous) => previous,
  });
}

export function useTransactions(filters: TransactionFilters = {}) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.finance.transactions(filters),
    queryFn: () => financeApi.transactions(api, filters),
  });
}

export function useBudgets(month?: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.finance.budgets(month),
    queryFn: () => financeApi.budgets(api, month),
  });
}

export function useGoals() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.finance.goals, queryFn: () => financeApi.goals(api) });
}

export function useCreateTransaction() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (input: TransactionInput) => financeApi.createTransaction(api, input),
    onSuccess: refresh,
  });
}

/** Saves confirmed voice/AI drafts in one request. */
export function useCreateTransactions() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: ({ transactions, source }: { transactions: TransactionInput[]; source?: TransactionSource }) =>
      financeApi.createTransactions(api, transactions, source ?? 'manual'),
    onSuccess: refresh,
  });
}

export function useUpdateTransaction() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TransactionInput> }) =>
      financeApi.updateTransaction(api, id, updates),
    onSuccess: refresh,
  });
}

export function useDeleteTransaction() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteTransaction(api, id),
    onSuccess: refresh,
  });
}

export function useSetBudget() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (input: { category: ExpenseCategory; limit: number; month?: string }) =>
      financeApi.setBudget(api, input),
    onSuccess: refresh,
  });
}

export function useDeleteBudget() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: ({ category, month }: { category: ExpenseCategory; month?: string }) =>
      financeApi.deleteBudget(api, category, month),
    onSuccess: refresh,
  });
}

export function useCreateGoal() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (input: { name: string; targetAmount: number; savedAmount?: number; targetDate?: string }) =>
      financeApi.createGoal(api, input),
    onSuccess: refresh,
  });
}

export function useContributeToGoal() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => financeApi.contributeToGoal(api, id, amount),
    onSuccess: refresh,
  });
}

export function useDeleteGoal() {
  const api = useApi();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteGoal(api, id),
    onSuccess: refresh,
  });
}

/**
 * Whether the server can transcribe speech. When false the app hides the mic and offers typed
 * quick-add instead — the feature degrades rather than showing a button that always fails.
 */
export function useVoiceCapabilities() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.voice.capabilities,
    queryFn: () => voiceApi.capabilities(api),
    staleTime: 10 * 60_000, // server config, not user data
  });
}

/** Status of every supported broker (Upstox, Zerodha) for the Profile "Connected accounts" section. */
export function useBrokerages() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.integrations.all,
    queryFn: async () => (await integrationsApi.list(api)).integrations,
  });
}
