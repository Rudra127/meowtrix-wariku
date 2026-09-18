import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMessage } from '@/api/types';
import { AppText, Button, IconButton, PressableScale, Screen, type IconName } from '@/components/ui';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { getErrorMessage } from '@/lib/errors';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { AiOrb } from './AiOrb';
import { MessageContent } from './MessageContent';
import { TypingDots } from './TypingDots';
import { useChat } from './useChat';

const SUGGESTIONS: { icon: IconName; text: string }[] = [
  { icon: 'pie-chart-outline', text: 'Help me build a monthly budget' },
  { icon: 'umbrella-outline', text: 'How big should my emergency fund be?' },
  { icon: 'trending-up-outline', text: 'Explain SIPs like I’m new to investing' },
  { icon: 'card-outline', text: 'How do I pay off credit card debt fast?' },
];

export function ChatScreen() {
  const { messages, send, retry, reset, isSending, error } = useChat();
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  // Keep the composer just above the floating tab bar (or the keyboard when it's open).
  const composerBottom = keyboardVisible ? spacing.sm : Math.max(insets.bottom, spacing.md) + 64 + spacing.md;

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length, isSending]);

  const onSend = (text = input) => {
    if (!text.trim() || isSending) return;
    send(text);
    setInput('');
  };

  const canSend = !!input.trim() && !isSending;

  return (
    <Screen
      scroll={false}
      background={
        <LinearGradient colors={[colors.mint, colors.background]} style={styles.gradient} pointerEvents="none" />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AiOrb size={40} />
          <View>
            <AppText variant="heading">Wariku AI</AppText>
            <View style={styles.online}>
              <View style={styles.onlineDot} />
              <AppText variant="caption">Your money coach</AppText>
            </View>
          </View>
        </View>
        <IconButton icon="create-outline" onPress={reset} disabled={!messages.length} accessibilityLabel="New chat" />
      </View>

      <FlatList
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <Bubble message={item} />}
        ListEmptyComponent={<EmptyState onPick={onSend} />}
        ListFooterComponent={
          <>
            {isSending && (
              <View style={styles.assistantRow}>
                <AiOrb size={28} />
                <View style={[styles.assistantBubble, shadow.card]}>
                  <TypingDots />
                </View>
              </View>
            )}
            {!!error && !isSending && (
              <View style={styles.errorCard}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                <AppText variant="caption" color={colors.danger} style={styles.flex}>
                  {getErrorMessage(error)}
                </AppText>
                <Button title="Retry" size="sm" variant="secondary" onPress={retry} />
              </View>
            )}
          </>
        }
      />

      <View style={[styles.composerWrap, { paddingBottom: composerBottom }]}>
        <View style={[styles.composer, shadow.card]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about budgets, saving, investing…"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.primary}
            multiline
            maxLength={4000}
          />
          <PressableScale
            onPress={() => onSend()}
            disabled={!canSend}
            scaleTo={0.88}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.send, canSend ? styles.sendActive : styles.sendIdle]}
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? colors.primary : colors.textSubtle} />
          </PressableScale>
        </View>
        <AppText variant="caption" center color={colors.textSubtle} style={styles.disclaimer}>
          Educational guidance, not financial advice.
        </AppText>
      </View>
    </Screen>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View style={styles.empty}>
      <AiOrb size={84} pulse />
      <AppText variant="title" center style={styles.emptyTitle}>
        How can I help with your money today?
      </AppText>
      <AppText variant="body" center color={colors.textMuted}>
        Ask anything — budgeting, saving, loans, investing basics.
      </AppText>
      <View style={styles.grid}>
        {SUGGESTIONS.map((s) => (
          <PressableScale key={s.text} onPress={() => onPick(s.text)} containerStyle={styles.suggestionWrap} style={[styles.suggestion, shadow.card]}>
            <View style={styles.suggestionIcon}>
              <Ionicons name={s.icon} size={18} color={colors.primary} />
            </View>
            <AppText variant="caption" color={colors.text} style={styles.suggestionText}>
              {s.text}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <View style={styles.userBubble}>
        <AppText variant="body" color={colors.textOnPrimary}>
          {message.content}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.assistantRow}>
      <AiOrb size={28} />
      <View style={[styles.assistantBubble, shadow.card]}>
        <MessageContent text={message.content} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.md, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  emptyTitle: { marginTop: spacing.md, maxWidth: 300 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  suggestionWrap: { width: '47.5%', flexGrow: 1 },
  suggestion: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: 96,
  },
  suggestionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: { fontFamily: fonts.semibold },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.ink,
    borderRadius: 22,
    borderBottomRightRadius: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, maxWidth: '92%' },
  assistantBubble: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderTopLeftRadius: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  composerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingLeft: spacing.lg,
    padding: 6,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
    paddingTop: 12,
    paddingBottom: 12,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendActive: { backgroundColor: colors.accent },
  sendIdle: { backgroundColor: colors.surfaceMuted },
  disclaimer: { marginTop: spacing.xs, fontSize: 11 },
});
