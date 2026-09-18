// @file backend/lib/deepseek.js
// Minimal DeepSeek client. DeepSeek's API is OpenAI-compatible:
//   POST {baseUrl}/chat/completions  — https://api-docs.deepseek.com/
// Kept dependency-free (Node 20 fetch) so swapping providers only touches this file.
import { config } from "../config/index.js";
import { ServiceUnavailableError, UpstreamError } from "../utils/index.js";

/**
 * @typedef {{ role: "system" | "user" | "assistant", content: string }} ChatMessage
 * @typedef {{ content: string, model: string, finishReason: string | null,
 *             usage: { promptTokens: number, completionTokens: number, totalTokens: number } | null }} ChatResult
 */

/**
 * @param {ChatMessage[]} messages
 * @param {{ model?: string, temperature?: number, maxTokens?: number, timeoutMs?: number,
 *           fetchImpl?: typeof fetch, apiKey?: string, baseUrl?: string }} [options]
 * @returns {Promise<ChatResult>}
 */
export async function createChatCompletion(messages, options = {}) {
  const {
    model = config.deepseek.model,
    temperature = 0.7,
    maxTokens = 1024,
    timeoutMs = 60_000,
    fetchImpl = fetch,
    apiKey = config.deepseek.apiKey,
    baseUrl = config.deepseek.baseUrl,
  } = options;

  if (!apiKey) throw new ServiceUnavailableError("AI assistant is not configured (DEEPSEEK_API_KEY missing)");

  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === "TimeoutError" ? "timed out" : "is unreachable";
    throw new UpstreamError(`AI provider ${reason}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Don't leak provider error bodies to clients; log-worthy detail stays server side.
    console.error(`[deepseek] ${response.status} ${text.slice(0, 500)}`);
    if (response.status === 401 || response.status === 402) {
      throw new ServiceUnavailableError("AI assistant is temporarily unavailable");
    }
    throw new UpstreamError(`AI provider returned ${response.status}`);
  }

  const json = await response.json();
  const choice = json?.choices?.[0];
  if (typeof choice?.message?.content !== "string") throw new UpstreamError("AI provider returned no content");

  return {
    content: choice.message.content,
    model: json.model ?? model,
    finishReason: choice.finish_reason ?? null,
    usage: json.usage
      ? {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : null,
  };
}
