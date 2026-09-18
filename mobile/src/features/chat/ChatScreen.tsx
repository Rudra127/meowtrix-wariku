import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ChatMessage } from '@/api/types';
import { Button, FormError, Screen } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { colors, radius, spacing, typography } from '@/theme';
import { useChat } from './useChat';

const SUGGESTIONS = [
  'How do I start a monthly budget?',
  'What is an emergency fund and how big should it be?',
  'Explain compound interest with an example.',
];

export function ChatScreen() {
  const { messages, send, retry, reset, isSending, error } = useChat();
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, isSending]);

  const onSend = (text = input) => {
    send(text);
    setInput('');
  };

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={typography.heading}>Ask AI</Text>
        {messages.length > 0 && (
          <Pressable onPress={reset} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.newChat}>New chat</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Bubble message={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.muted}>Ask anything about money. Try:</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.suggestion} onPress={() => onSend(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        }
        ListFooterComponent={
          <>
            {isSending && <ActivityIndicator style={styles.typing} color={colors.primary} />}
            {!!error && !isSending && (
              <View style={styles.errorBox}>
                <FormError message={getErrorMessage(error)} />
                <Button title="Try again" variant="secondary" onPress={retry} />
              </View>
            )}
          </>
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about budgeting, saving, investing…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!input.trim() || isSending}
          onPress={() => onSend()}
          style={[styles.send, (!input.trim() || isSending) && styles.sendDisabled]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.textOnPrimary} />
        </Pressable>
      </View>
      <Text style={styles.disclaimer}>Educational information only — not financial advice.</Text>
    </Screen>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <Text style={[styles.bubbleText, mine && styles.mineText]}>{message.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  newChat: { color: colors.primary, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { gap: spacing.sm, paddingTop: spacing.xl },
  muted: { color: colors.textMuted, fontSize: 15 },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  suggestionText: { color: colors.text, fontSize: 15 },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.text },
  mineText: { color: colors.textOnPrimary },
  typing: { alignSelf: 'flex-start', marginLeft: spacing.md, marginTop: spacing.sm },
  errorBox: { gap: spacing.sm, marginTop: spacing.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  disclaimer: { textAlign: 'center', fontSize: 12, color: colors.textMuted, paddingVertical: spacing.sm },
});
