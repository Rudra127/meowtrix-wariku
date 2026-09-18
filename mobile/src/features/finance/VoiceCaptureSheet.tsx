import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Linking, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Badge, Button, FormError, PressableScale, Sheet } from '@/components/ui';
import { colors, fonts, isDark, radius, shadow, spacing, themed } from '@/theme';
import { DraftRow } from './DraftRow';
import { MAX_DURATION_MS, useVoiceCapture } from './useVoiceCapture';

type Props = {
  visible: boolean;
  onClose: () => void;
  currency: string;
  /** True when the server has a speech provider. When false, only typed entry is offered. */
  speechEnabled: boolean;
  onSaved?: (count: number) => void;
};

const seconds = (ms: number) => `0:${String(Math.floor(ms / 1000)).padStart(2, '0')}`;

/**
 * "Just say it" entry point for the Money tab.
 *
 * Three stages in one sheet: record → processing → review. The review list arrives fully selected,
 * so the common case is hold-speak-release-tap. Nothing is written until the user confirms.
 */
export function VoiceCaptureSheet({ visible, onClose, currency, speechEnabled, onSaved }: Props) {
  const capture = useVoiceCapture();
  const [typed, setTyped] = useState('');
  const [showTyping, setShowTyping] = useState(!speechEnabled);

  const close = () => {
    if (capture.isRecording) capture.stop({ discard: true });
    capture.reset();
    setTyped('');
    setShowTyping(!speechEnabled);
    onClose();
  };

  // Safety net: stop at the ceiling so a stuck button can't record forever.
  useEffect(() => {
    if (capture.isRecording && capture.durationMillis >= MAX_DURATION_MS) capture.stop();
  }, [capture]);

  const pressIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await capture.start();
  };

  const pressOut = async () => {
    if (!capture.isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await capture.stop();
  };

  const confirm = async () => {
    const count = await capture.confirm();
    if (count > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved?.(count);
      setTyped('');
      onClose();
    }
  };

  const reviewing = capture.stage === 'review' && capture.drafts.length > 0;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={reviewing ? 'Does this look right?' : 'Add by voice'}
      scroll={reviewing}
      footer={
        reviewing ? (
          <View style={styles.footer}>
            <Button
              title={
                capture.selectedCount === 0
                  ? 'Nothing selected'
                  : `Add ${capture.selectedCount} ${capture.selectedCount === 1 ? 'transaction' : 'transactions'}`
              }
              onPress={confirm}
              disabled={capture.selectedCount === 0}
              loading={capture.isSaving}
            />
            <Button title="Start over" variant="ghost" size="sm" onPress={capture.reset} />
          </View>
        ) : null
      }
    >
      <FormError message={capture.error} />

      {capture.permissionDenied && (
        <Button
          title="Open settings"
          variant="secondary"
          size="sm"
          onPress={() => Linking.openSettings()}
          icon={<Ionicons name="settings-outline" size={16} color={colors.text} />}
        />
      )}

      {reviewing ? (
        <>
          {!!capture.result?.transcript && (
            <View style={styles.transcript}>
              <Ionicons name="ear-outline" size={14} color={colors.brand} />
              <AppText variant="caption" color={colors.text} style={styles.flex}>
                “{capture.result.transcript}”
              </AppText>
            </View>
          )}

          {capture.drafts.map((draft, index) => (
            <DraftRow
              key={`${draft.title}-${index}`}
              draft={draft}
              currency={currency}
              onToggle={() => capture.toggleDraft(index)}
              onChange={(patch) => capture.updateDraft(index, patch)}
              onRemove={() => capture.removeDraft(index)}
            />
          ))}

          {!!capture.result?.unclear.length && (
            <View style={styles.unclear}>
              <AppText variant="caption" color={colors.textMuted}>
                Couldn&apos;t work out an amount for:
              </AppText>
              {capture.result.unclear.map((phrase) => (
                <AppText key={phrase} variant="caption" color={colors.text}>
                  · “{phrase}”
                </AppText>
              ))}
            </View>
          )}
        </>
      ) : capture.stage === 'processing' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <AppText variant="bodyStrong">Working out what you spent…</AppText>
          <AppText variant="caption" center>
            Transcribing and matching categories.
          </AppText>
        </View>
      ) : (
        <View style={styles.center}>
          {speechEnabled && !showTyping ? (
            <>
              <MicButton
                recording={capture.isRecording}
                level={capture.level}
                onPressIn={pressIn}
                onPressOut={pressOut}
              />
              <AppText variant="bodyStrong" center>
                {capture.isRecording ? seconds(capture.durationMillis) : 'Hold and speak'}
              </AppText>
              <AppText variant="caption" center style={styles.hint}>
                {capture.isRecording
                  ? 'Release when you’re done'
                  : '“Spent 250 on coffee and 1,200 on groceries”'}
              </AppText>
              <Button title="Type it instead" variant="ghost" size="sm" onPress={() => setShowTyping(true)} />
            </>
          ) : (
            <View style={styles.typedBlock}>
              {!speechEnabled && (
                <Badge tone="neutral" icon="information-circle-outline" label="Voice isn’t set up on the server yet" />
              )}
              <AppText variant="caption">
                Describe what you spent in plain words — the AI will split it into transactions.
              </AppText>
              <TextInput
                keyboardAppearance={isDark() ? 'dark' : 'light'}
                value={typed}
                onChangeText={setTyped}
                placeholder="Spent 250 on coffee and 1,200 on groceries"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                multiline
                maxLength={1000}
                accessibilityLabel="What did you spend?"
              />
              <Button
                title="Work it out"
                onPress={() => capture.parseText(typed)}
                disabled={!typed.trim()}
                icon={<Ionicons name="sparkles" size={16} color={colors.textOnPrimary} />}
              />
              {speechEnabled && (
                <Button title="Use voice instead" variant="ghost" size="sm" onPress={() => setShowTyping(false)} />
              )}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** Press-and-hold mic with a level-reactive halo. */
function MicButton({
  recording,
  level,
  onPressIn,
  onPressOut,
}: {
  recording: boolean;
  level: number;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  // `useState(() => …)` rather than `useRef(new Animated.Value(0)).current`: an Animated.Value is
  // read during render to build the style, which the refs lint rule (correctly) forbids for refs.
  const [halo] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(halo, {
      toValue: recording ? 0.4 + level * 0.6 : 0,
      duration: 110,
      useNativeDriver: true,
    }).start();
  }, [halo, level, recording]);

  return (
    <View style={styles.micWrap}>
      <Animated.View
        style={[
          styles.halo,
          { transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }], opacity: halo },
        ]}
        pointerEvents="none"
      />
      <PressableScale
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel="Hold to record"
        style={[styles.mic, recording && styles.micActive, shadow.card]}
      >
        <Ionicons name="mic" size={38} color={recording ? colors.textOnAccent : colors.textOnPrimary} />
      </PressableScale>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  hint: { maxWidth: 260 },
  micWrap: { alignItems: 'center', justifyContent: 'center', width: 132, height: 132 },
  halo: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.accent },
  mic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { backgroundColor: colors.accent },
  typedBlock: { gap: spacing.md, width: '100%' },
  input: {
    minHeight: 90,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  transcript: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  unclear: { gap: 2, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md },
  footer: { gap: spacing.xs },
}));
