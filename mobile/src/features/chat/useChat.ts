import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { aiApi } from '@/api/endpoints';
import type { ChatMessage } from '@/api/types';
import { useApi } from '@/api/useApi';

/** Server limit is 40 messages per request — send only the most recent turns. */
const MAX_HISTORY = 20;

/**
 * Local, in-memory conversation with the finance assistant.
 * Next steps (docs/ROADMAP.md): persist conversations server-side and stream responses.
 */
export function useChat() {
  const api = useApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const mutation = useMutation({
    mutationFn: (history: ChatMessage[]) => aiApi.chat(api, history.slice(-MAX_HISTORY)),
    onSuccess: (res) => setMessages((prev) => [...prev, res.message]),
  });

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || mutation.isPending) return;
      const next = [...messages, { role: 'user' as const, content }];
      setMessages(next);
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
    mutation.reset();
  }, [mutation]);

  return { messages, send, retry, reset, isSending: mutation.isPending, error: mutation.error };
}
