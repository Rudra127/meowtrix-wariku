/**
 * Voice-driven transaction entry.
 *
 *   hold mic → expo-audio records .m4a → upload to /finance/voice → backend transcribes + extracts
 *   → drafts land here → user confirms → POST /finance/transactions
 *
 * Drafts are NOT auto-saved. Speech recognition mishears numbers ("fifty"/"fifteen") and a wrong
 * amount silently entering someone's ledger is far worse than one confirmation tap. Every draft
 * arrives pre-selected, so confirming is a single press.
 *
 * expo-audio notes (SDK 57):
 *   - `useAudioRecorder(options)` returns a recorder that must be prepared before `record()`, but
 *     `stop()` leaves it prepared. Preparing again throws, so go through `prepareRecorder()` rather
 *     than calling `prepareToRecordAsync()` directly.
 *   - Recording needs `setAudioModeAsync({ allowsRecording: true })` on iOS, or `record()` silently
 *     produces an empty file.
 */
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useMemo, useState } from 'react';
import { voiceApi } from '@/api/endpoints';
import type { TransactionDraft, TransactionInput, VoiceCaptureResult } from '@/api/types';
import { useApi } from '@/api/useApi';
import { getErrorMessage } from '@/lib/errors';
import { useCreateTransactions } from './useFinance';

/**
 * Mono, modest bitrate: speech only. Roughly 8 KB/s, so a 10-second note is ~80 KB — quick to
 * upload on mobile data and well within Whisper's quality needs.
 */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true, // drives the level animation while recording
};

const MIME_TYPE = 'audio/m4a';
/** Below this, the user almost certainly tapped rather than held the button. */
const MIN_DURATION_MS = 700;
/** Hard stop, matching the backend's upload ceiling. */
export const MAX_DURATION_MS = 60_000;

export type CaptureStage = 'idle' | 'recording' | 'processing' | 'review';

/** A draft the user can tweak before saving, plus whether it's selected. */
export type EditableDraft = TransactionDraft & { selected: boolean };

export function useVoiceCapture() {
  const api = useApi();
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const save = useCreateTransactions();

  const [stage, setStage] = useState<CaptureStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceCaptureResult | null>(null);
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);
  /** Set when the OS denied the mic, so the UI can point at Settings instead of retrying. */
  const [permissionDenied, setPermissionDenied] = useState(false);

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    setResult(null);
    setDrafts([]);
    save.reset();
  }, [save]);

  const applyResult = useCallback((captured: VoiceCaptureResult) => {
    setResult(captured);
    // Everything pre-selected: confirming the whole note is one tap. Low-confidence rows are still
    // flagged visually via `needsReview` so they get a second look.
    setDrafts(captured.drafts.map((d) => ({ ...d, selected: true })));
    setStage(captured.drafts.length ? 'review' : 'idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const existing = await getRecordingPermissionsAsync();
      const granted = existing.granted ? existing : await requestRecordingPermissionsAsync();
      if (!granted.granted) {
        setPermissionDenied(!granted.canAskAgain);
        setError(
          granted.canAskAgain
            ? 'Microphone access is needed to add expenses by voice.'
            : 'Microphone access is blocked. Enable it in your device settings to use voice.',
        );
        return false;
      }
      setPermissionDenied(false);

      // iOS routes audio differently for playback vs recording; without this the file is empty.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await prepareRecorder(recorder);
      recorder.record();
      setStage('recording');
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't start recording."));
      setStage('idle');
      return false;
    }
  }, [recorder]);

  /** Stops, uploads, and moves to review. Pass `discard` to throw the clip away. */
  const stop = useCallback(
    async ({ discard = false }: { discard?: boolean } = {}) => {
      const duration = recorderState.durationMillis;
      try {
        await recorder.stop();
      } catch {
        // Already stopped, or the recorder was reset by the OS — nothing useful to do.
      }
      // Release the recording audio session so playback elsewhere isn't left in the wrong mode.
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});

      const uri = normaliseFileUri(recorder.uri);
      if (discard) {
        setStage('idle');
        return;
      }
      if (!uri) {
        setError("That recording didn't save. Try again.");
        setStage('idle');
        return;
      }
      if (duration < MIN_DURATION_MS) {
        setError('Hold the button and say what you spent.');
        setStage('idle');
        return;
      }

      setStage('processing');
      try {
        const captured = await voiceApi.fromAudio(api, { uri, name: 'note.m4a', type: MIME_TYPE });
        applyResult(captured);
        if (!captured.drafts.length) setError(captured.message);
      } catch (err) {
        setError(getErrorMessage(err));
        setStage('idle');
      }
    },
    [api, applyResult, recorder, recorderState.durationMillis],
  );

  /** The typed path — also the fallback when the server has no speech provider. */
  const parseText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);
      setStage('processing');
      try {
        const captured = await voiceApi.fromText(api, text);
        applyResult(captured);
        if (!captured.drafts.length) setError(captured.message);
      } catch (err) {
        setError(getErrorMessage(err));
        setStage('idle');
      }
    },
    [api, applyResult],
  );

  const toggleDraft = useCallback((index: number) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, selected: !d.selected } : d)));
  }, []);

  const updateDraft = useCallback((index: number, patch: Partial<TransactionDraft>) => {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === index
          ? // An edited row is one the user has looked at, so it no longer needs flagging.
            { ...d, ...patch, needsReview: false }
          : d,
      ),
    );
  }, []);

  const removeDraft = useCallback((index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const selected = useMemo(() => drafts.filter((d) => d.selected), [drafts]);

  /** Writes the selected drafts. Resolves to the number saved. */
  const confirm = useCallback(async () => {
    if (!selected.length) return 0;
    const transactions: TransactionInput[] = selected.map((d) => ({
      type: d.type,
      amount: d.amount,
      category: d.category,
      title: d.title,
      date: d.date,
    }));
    try {
      const saved = await save.mutateAsync({ transactions, source: 'voice' });
      reset();
      return saved.created;
    } catch (err) {
      setError(getErrorMessage(err));
      return 0;
    }
  }, [reset, save, selected]);

  return {
    stage,
    error,
    permissionDenied,
    result,
    drafts,
    selectedCount: selected.length,
    /** Live mic level, 0–1, for the recording animation. */
    level: normaliseMetering(recorderState.metering),
    durationMillis: recorderState.durationMillis,
    isRecording: recorderState.isRecording,
    isSaving: save.isPending,
    start,
    stop,
    parseText,
    toggleDraft,
    updateDraft,
    removeDraft,
    confirm,
    reset,
    clearError: () => setError(null),
  };
}

/**
 * Prepares the recorder for a take, but only when it actually needs it.
 *
 * `stop()` does not un-prepare the recorder, so calling `prepareToRecordAsync()` before every
 * recording rejects on the second one with "Audio recorder is already prepared. Stop or release the
 * current session before preparing again." `getStatus().canRecord` is the readiness flag, read
 * synchronously from native state (the `useAudioRecorderState` poll can be up to 100ms stale).
 *
 * `mediaServicesDidReset` forces a re-prepare: iOS sets it when the system media daemon restarts,
 * which invalidates the recorder even though it still looks prepared.
 */
async function prepareRecorder(recorder: AudioRecorder): Promise<void> {
  const status = recorder.getStatus();
  if (status.canRecord && !status.mediaServicesDidReset) return;

  try {
    await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
  } catch (err) {
    // Platforms disagree slightly on when `canRecord` flips. If the recorder ended up usable anyway,
    // don't fail the take over it; only surface the error when it really can't record.
    if (!recorder.getStatus().canRecord) throw err;
  }
}

/**
 * React Native's uploader needs a URI it can resolve. `recorder.uri` is normally a `file://` URL,
 * but on Android it can come back as a bare absolute path, and handing that to FormData makes the
 * request reject before it ever leaves the device — which used to surface as "is the backend
 * running?". Add the scheme when it's missing and leave anything else (`content://`) alone.
 */
export function normaliseFileUri(uri: string | null | undefined): string | null {
  const trimmed = uri?.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/** expo-audio reports metering in dBFS (about −160 → 0). Map it to a usable 0–1 range. */
function normaliseMetering(metering?: number) {
  if (typeof metering !== 'number' || Number.isNaN(metering)) return 0;
  const floor = -50; // quiet room; below this there's nothing worth animating
  return Math.min(1, Math.max(0, (metering - floor) / -floor));
}
