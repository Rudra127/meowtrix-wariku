/**
 * One typed function per backend endpoint. Add new endpoints here (grouped by feature),
 * then wrap them in React Query hooks under src/hooks or src/features/<feature>/.
 */
import type { ApiClient, UploadFile } from './client';
import type {
  Account,
  BudgetStatus,
  ChatMessage,
  ChatResponse,
  ExpenseCategory,
  FinanceSeries,
  FinanceSummary,
  Goal,
  GoalItem,
  BrokerLoginUrl,
  BrokerProvider,
  IntegrationStatus,
  Level,
  SeriesPeriod,
  Transaction,
  TransactionInput,
  TransactionPage,
  TransactionSource,
  User,
  VoiceCapabilities,
  VoiceCaptureResult,
} from './types';

export const authApi = {
  /** Verifies the session and creates the backend user on first call. */
  me: (api: ApiClient) => api.get<{ user: User }>('/auth/me'),
  /** Re-pulls name/email/avatar from Clerk into the backend. */
  sync: (api: ApiClient) => api.post<{ user: User }>('/auth/sync'),
};

export const usersApi = {
  updateMe: (api: ApiClient, updates: Partial<Pick<User, 'isOnboarded' | 'currency' | 'level' | 'goal' | 'timezone'>>) =>
    api.patch<{ user: User }>('/users/me', updates),
  /** Saves the onboarding questionnaire and sets isOnboarded = true. */
  completeOnboarding: (api: ApiClient, answers: { level: Level; goal: Goal; currency?: string; timezone?: string }) =>
    api.put<{ user: User }>('/users/me/onboarding', answers),
  deleteMe: (api: ApiClient) => api.delete<{ deleted: true }>('/users/me'),
};

export const aiApi = {
  /** May run several tool round-trips server-side, so it gets a long timeout. */
  chat: (api: ApiClient, messages: ChatMessage[]) =>
    api.post<ChatResponse>('/ai/chat', { messages }, { timeoutMs: 120_000 }),
};

// ---- Money -----------------------------------------------------------------------------------
// All amounts are integers in MINOR units (paise/cents).

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export type TransactionFilters = {
  month?: string;
  from?: string;
  to?: string;
  type?: 'income' | 'expense';
  category?: string;
  source?: TransactionSource;
  q?: string;
  limit?: number;
  skip?: number;
};

export const financeApi = {
  /** Everything the Money dashboard header needs, in one request. */
  summary: (api: ApiClient, month?: string) => api.get<FinanceSummary>(`/finance/summary${query({ month })}`),

  series: (api: ApiClient, period: SeriesPeriod, month?: string) =>
    api.get<FinanceSeries>(`/finance/series${query({ period, month })}`),

  transactions: (api: ApiClient, filters: TransactionFilters = {}) =>
    api.get<TransactionPage>(`/finance/transactions${query(filters)}`),

  createTransaction: (api: ApiClient, input: TransactionInput) =>
    api.post<{ transaction: Transaction }>('/finance/transactions', input),

  /** Saves several at once — how confirmed voice drafts get written. */
  createTransactions: (api: ApiClient, transactions: TransactionInput[], source: TransactionSource = 'manual') =>
    api.post<{ transactions: Transaction[]; created: number }>('/finance/transactions', { transactions, source }),

  updateTransaction: (api: ApiClient, id: string, updates: Partial<TransactionInput>) =>
    api.patch<{ transaction: Transaction }>(`/finance/transactions/${id}`, updates),

  deleteTransaction: (api: ApiClient, id: string) => api.delete<{ deleted: true }>(`/finance/transactions/${id}`),

  accounts: (api: ApiClient) => api.get<{ accounts: Account[] }>('/finance/accounts'),

  createAccount: (api: ApiClient, input: { name: string; type?: string; openingBalance?: number; isDefault?: boolean }) =>
    api.post<{ account: Account }>('/finance/accounts', input),

  budgets: (api: ApiClient, month?: string) =>
    api.get<{ month: string; currency: string; budgets: BudgetStatus[] }>(`/finance/budgets${query({ month })}`),

  /** Creates or overwrites one category's limit for a month. */
  setBudget: (api: ApiClient, input: { category: ExpenseCategory; limit: number; month?: string }) =>
    api.put<{ budget: BudgetStatus }>('/finance/budgets', input),

  deleteBudget: (api: ApiClient, category: ExpenseCategory, month?: string) =>
    api.delete<{ deleted: true }>(`/finance/budgets/${category}${query({ month })}`),

  copyPreviousBudgets: (api: ApiClient, month?: string) =>
    api.post<{ month: string; budgets: BudgetStatus[] }>('/finance/budgets/copy-previous', { month }),

  goals: (api: ApiClient) => api.get<{ currency: string; goals: GoalItem[] }>('/finance/goals'),

  createGoal: (api: ApiClient, input: { name: string; targetAmount: number; savedAmount?: number; targetDate?: string }) =>
    api.post<{ goal: GoalItem }>('/finance/goals', input),

  updateGoal: (api: ApiClient, id: string, updates: { name?: string; targetAmount?: number; targetDate?: string | null }) =>
    api.patch<{ goal: GoalItem }>(`/finance/goals/${id}`, updates),

  /** Positive to add, negative to withdraw. Minor units. */
  contributeToGoal: (api: ApiClient, id: string, amount: number) =>
    api.post<{ goal: GoalItem }>(`/finance/goals/${id}/contribute`, { amount }),

  deleteGoal: (api: ApiClient, id: string) => api.delete<{ deleted: true }>(`/finance/goals/${id}`),
};

// ---- Voice capture ---------------------------------------------------------------------------
// These RETURN DRAFTS and write nothing. Confirm with financeApi.createTransactions.

export const voiceApi = {
  /** Tells the app whether to show the mic at all. */
  capabilities: (api: ApiClient) => api.get<VoiceCapabilities>('/finance/voice/capabilities'),

  /** Uploads a recording. `file.uri` is the local file:// path from expo-audio. */
  fromAudio: (api: ApiClient, file: UploadFile, language?: string) =>
    api.postForm<VoiceCaptureResult>(
      '/finance/voice',
      { field: 'audio', value: file },
      language ? { language } : {},
      // Transcription plus extraction — two model calls back to back.
      { timeoutMs: 120_000 },
    ),

  /** The typed equivalent: "spent 250 on coffee, 1200 groceries". */
  fromText: (api: ApiClient, text: string) =>
    api.post<VoiceCaptureResult>('/finance/parse', { text }, { timeoutMs: 60_000 }),
};

// ---- Linked accounts -------------------------------------------------------------------------

export const integrationsApi = {
  /** Status of every supported broker — what Profile renders. */
  list: (api: ApiClient) => api.get<{ integrations: IntegrationStatus[] }>('/integrations'),
  status: (api: ApiClient, provider: BrokerProvider) => api.get<IntegrationStatus>(`/integrations/${provider}`),
  /** Open the returned URL in a browser; the broker redirects back into the app when done. */
  loginUrl: (api: ApiClient, provider: BrokerProvider) =>
    api.get<BrokerLoginUrl>(`/integrations/${provider}/login-url`),
  disconnect: (api: ApiClient, provider: BrokerProvider) =>
    api.delete<{ disconnected: true }>(`/integrations/${provider}`),
};
