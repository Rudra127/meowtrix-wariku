/**
 * Tiny fetch wrapper for the Wariku backend.
 *
 * - Prefixes API_URL, sends/parses JSON, unwraps `{ success, data }` → `data`.
 * - Attaches `Authorization: Bearer <Clerk session token>` when a token getter is provided.
 * - Throws `ApiError` (status/code/message) for every failure, including network errors.
 * - Supports `multipart/form-data` uploads (voice capture) via `postForm`.
 *
 * Inside React, use `useApi()` (src/api/useApi.ts) which wires in Clerk's `getToken`.
 */
import { API_ORIGIN, API_URL } from '@/config/env';
import type { ApiEnvelope } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number, // 0 = network error / timeout
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type TokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestOptions = { method?: Method; body?: unknown; timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 30_000;

/** A file picked from the device, in the shape React Native's FormData expects. */
export type UploadFile = { uri: string; name: string; type: string };

/** Raised by the multipart path so the caller can tell a timeout from a transport failure. */
class UploadTimeout extends Error {}

/**
 * Multipart uploads go through `XMLHttpRequest`, not `fetch`.
 *
 * Expo SDK 57's global `fetch` is Expo's WinterCG implementation, and it accepts a FormData part
 * only as a string, a real `Blob`, or something exposing `.bytes()`. React Native's
 * `{ uri, name, type }` file shape is explicitly unsupported there and throws
 * "Unsupported FormDataPart implementation" before the request leaves the device.
 *
 * React Native's own XHR does understand `{ uri, ... }` — it is the long-standing RN upload path,
 * and it streams the file from disk instead of loading it into JS memory. Using it avoids pulling in
 * expo-file-system (native code, and therefore a dev-client rebuild) purely to convert a local file
 * into a Blob.
 */
function sendMultipart(path: string, token: string | null, form: FormData, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Content-Type is deliberately not set: React Native fills in multipart/form-data plus the
    // boundary, and overriding it produces a body the server can't parse.

    xhr.onload = () => {
      // Rebuild a real Response so `parse()` works the same for both transports. A null-body status
      // must not be given a body, or the Response constructor throws.
      const nullBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(nullBody ? null : xhr.responseText || null, { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('The upload could not be sent'));
    xhr.ontimeout = () => reject(new UploadTimeout('Upload timed out'));
    xhr.onabort = () => reject(new Error('The upload was cancelled'));

    try {
      xhr.send(form);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function send(path: string, token: string | null, { method = 'GET', body, timeoutMs }: RequestOptions) {
  const controller = new AbortController();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const limit = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = isFormData ? null : setTimeout(() => controller.abort(), limit);
  try {
    if (isFormData) return await sendMultipart(path, token, body as FormData, limit);
    return await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted || err instanceof UploadTimeout) {
      throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond.', err);
    }

    // `fetch` rejecting does NOT prove the server is down. A multipart upload also lands here when
    // the local file can't be read, which is why this used to blame the backend for a file problem.
    // Ask /health before accusing anyone.
    const reachable = await serverIsReachable();
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';

    // The underlying cause is the only thing that identifies a bad file URI, a TLS failure or a
    // genuinely dead server. Surface it in Metro rather than leaving it buried in `details`.
    if (__DEV__) {
      console.warn(`[api] ${method} ${path} failed`, {
        reachable,
        isFormData,
        apiUrl: API_URL,
        cause: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }

    if (reachable && isFormData) {
      throw new ApiError(
        0,
        'UPLOAD_FAILED',
        `The server is reachable but the upload failed${detail}. The recording may not have saved correctly.`,
        err,
      );
    }
    if (reachable) {
      throw new ApiError(0, 'REQUEST_FAILED', `That request failed${detail}. The server itself is reachable.`, err);
    }
    throw new ApiError(0, 'NETWORK_ERROR', `Can't reach the server (${API_URL}). Is the backend running?`, err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Cheap liveness probe against `GET /health`. Unauthenticated and short-timeout, used only to make a
 * failure message truthful. Never throws.
 */
async function serverIsReachable(timeoutMs = 4000): Promise<boolean> {
  if (!API_ORIGIN) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_ORIGIN}/health`, { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (res.ok && json?.success) return json.data;
  const error = json && !json.success ? json.error : undefined;
  throw new ApiError(
    res.status,
    error?.code ?? `HTTP_${res.status}`,
    error?.message ?? `Request failed with status ${res.status}`,
    error?.details,
  );
}

export function createApiClient(getToken?: TokenGetter) {
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const isUpload = typeof FormData !== 'undefined' && options.body instanceof FormData;
    // An upload can't be replayed (the body is backed by a file), so it gets no second chance on a
    // 401. Spend the extra round-trip on a fresh token up front instead of failing after the upload.
    const token = getToken ? await getToken(isUpload ? { skipCache: true } : undefined) : null;
    let res = await send(path, token, options);

    // A cached session token can be a few seconds from expiry by the time it reaches the server.
    // Retry once with a freshly minted token before surfacing a 401.
    if (res.status === 401 && getToken && !isUpload) {
      const fresh = await getToken({ skipCache: true });
      if (fresh) res = await send(path, fresh, options);
    }
    return parse<T>(res);
  }

  return {
    request,
    get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...opts, method: 'GET' }),
    post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...opts, method: 'POST', body }),
    put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...opts, method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...opts, method: 'PATCH', body }),
    delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...opts, method: 'DELETE' }),

    /**
     * Uploads a file plus optional text fields as multipart/form-data.
     * Used for voice capture, where the recording is a local `file://` URI.
     */
    postForm: <T>(
      path: string,
      file: { field: string; value: UploadFile },
      fields: Record<string, string> = {},
      opts?: Omit<RequestOptions, 'method' | 'body'>,
    ) => {
      const form = new FormData();
      // RN accepts `{ uri, name, type }` where the web expects a Blob; the cast keeps TS happy.
      form.append(file.field, file.value as unknown as Blob);
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      return request<T>(path, { ...opts, method: 'POST', body: form });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
