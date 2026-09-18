import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { aiApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { ChatMessage } from '@/api/types';
import { useApi } from '@/api/useApi';

/** Server limit is 40 messages per request — send only the most recent turns. */
const MAX_HISTORY = 20;

/**
 * Local, in-memory conversation with the finance assistant.
 *
 * The backend answers by calling tools against the user's real finance data and Zerodha holdings
 * (backend/services/ai-tools.js), so a reply can take a few seconds and may have side effects —
 * `record_transaction` writes to the ledger.
 *
 * Next step (docs/ROADMAP.md): persist conversations server-side and stream responses.
 */
export function useChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /**
   * Which tools produced the latest answer. Shown as a small hint, and it makes grounding visible:
   * figures with no tools behind them would mean the model invented them.
   */
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: (history: ChatMessage[]) => aiApi.chat(api, history.slice(-MAX_HISTORY)),
    onSuccess: (res) => {
      setMessages((prev) => [...prev, res.message]);
      setToolsUsed(res.toolsUsed ?? []);
      // The assistant can log transactions itself, so anything it wrote must appear on the Money
      // tab without the user pulling to refresh.
      if (res.toolsUsed?.includes('record_transaction')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
      }
    },
  });

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || mutation.isPending) return;
      const next = [...messages, { role: 'user' as const, content }];
      setMessages(next);
      setToolsUsed([]);
      mutation.mutate(next);
    },
    [messages, mutation],
  );

  /** Re-sends the conversation after a failed request (last message is the unanswered user turn). */
  const retry = useCallback(() => {
    if (messages.at(-1)?.role === 'user') mutation.mutate(messages);
  }, [messages, mutation]);

  const reset = useCallback(() => {
    setMessages([]);
    setToolsUsed([]);
    mutation.reset();
  }, [mutation]);

  return { messages, send, retry, reset, toolsUsed, isSending: mutation.isPending, error: mutation.error };
}

/** Plain-English summary of the tools behind an answer, or null when it was general knowledge. */
export function describeTools(toolsUsed: string[]): string | null {
  if (!toolsUsed.length) return null;
  const labels: Record<string, string> = {
    get_month_summary: 'your monthly summary',
    list_transactions: 'your transactions',
    get_spending_trend: 'your spending trend',
    get_budgets: 'your budgets',
    get_goals: 'your savings goals',
    get_accounts: 'your accounts',
    record_transaction: 'and saved it to your ledger',
    get_zerodha_holdings: 'your Zerodha holdings',
    get_zerodha_positions: 'your Zerodha positions',
  };
  const unique = [...new Set(toolsUsed)];
  const wrote = unique.includes('record_transaction');
  const read = unique.filter((t) => t !== 'record_transaction').map((t) => labels[t] ?? t);

  if (!read.length) return wrote ? 'Saved to your ledger' : null;
  const list = read.length === 1 ? read[0] : `${read.slice(0, -1).join(', ')} and ${read.at(-1)}`;
  return `Checked ${list}${wrote ? ', and saved it' : ''}`;
}
