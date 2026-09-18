// @file backend/lib/transcribe.js
// Speech-to-text client. Targets the OpenAI-compatible endpoint
//   POST {baseUrl}/audio/transcriptions   (multipart/form-data)
// which OpenAI, Groq and self-hosted faster-whisper servers all implement, so the provider is a
// config change rather than a code change.
//
// The audio never leaves the backend for anything else: the app uploads it here, we send it to the
// STT provider, and we keep only the transcript.
import { config } from "../config/index.js";
import { ServiceUnavailableError, UpstreamError, ValidationError } from "../utils/index.js";

/** Containers Whisper-family models accept. Keep in step with the app's recording preset. */
export const ALLOWED_AUDIO_TYPES = [
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
];

/** 10 MB ≈ 10 minutes of AAC. Quick-add clips are seconds long; this is a generous ceiling. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const extensionFor = (mimeType = "") => {
  const map = {
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
  };
  return map[mimeType.toLowerCase()] ?? "m4a";
};

/**
 * Transcribes an audio buffer.
 *
 * @param {Buffer} buffer
 * @param {{ mimeType?: string, filename?: string, language?: string, prompt?: string,
 *           timeoutMs?: number, fetchImpl?: typeof fetch, apiKey?: string, baseUrl?: string,
 *           model?: string }} [options]
 * @returns {Promise<{ text: string, model: string, language: string | null }>}
 */
export async function transcribeAudio(buffer, options = {}) {
  const {
    mimeType = "audio/m4a",
    filename,
    language,
    prompt,
    timeoutMs = 60_000,
    fetchImpl = fetch,
    apiKey = config.stt.apiKey,
    baseUrl = config.stt.baseUrl,
    model = config.stt.model,
  } = options;

  if (!apiKey) {
    throw new ServiceUnavailableError("Voice input is not set up yet (STT_API_KEY missing). Type the amount instead.");
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ValidationError("No audio received");
  if (buffer.length > MAX_AUDIO_BYTES) throw new ValidationError("That recording is too long — keep it under a minute");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename || `speech.${extensionFor(mimeType)}`);
  form.append("model", model);
  form.append("response_format", "json");
  // Nudging the decoder with the expected vocabulary measurably improves amount/merchant accuracy.
  if (prompt) form.append("prompt", prompt);
  if (language) form.append("language", language);

  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      // No Content-Type header: fetch sets the multipart boundary itself.
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === "TimeoutError" ? "timed out" : "is unreachable";
    throw new UpstreamError(`Speech recognition ${reason}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[stt] ${response.status} ${text.slice(0, 500)}`);
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      throw new ServiceUnavailableError("Voice input is temporarily unavailable");
    }
    if (response.status === 413) throw new ValidationError("That recording is too long");
    if (response.status === 429) throw new UpstreamError("Speech recognition is busy — try again in a moment");
    throw new UpstreamError(`Speech recognition returned ${response.status}`);
  }

  const json = await response.json().catch(() => null);
  const text = typeof json?.text === "string" ? json.text.trim() : "";
  return { text, model: json?.model ?? model, language: json?.language ?? language ?? null };
}
