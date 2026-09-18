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
import { API_URL } from '@/config/env';
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

async function send(path: string, token: string | null, { method = 'GET', body, timeoutMs }: RequestOptions) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  // React Native sets the multipart boundary itself — setting Content-Type by hand breaks the upload.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isFormData && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    throw new ApiError(
      0,
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? 'The server took too long to respond.' : `Can't reach the server (${API_URL}). Is the backend running?`,
      err,
    );
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
    const token = getToken ? await getToken() : null;
    let res = await send(path, token, options);

    // A cached session token can be a few seconds from expiry by the time it reaches the server.
    // Retry once with a freshly minted token before surfacing a 401.
    // Not retried for uploads: a FormData body backed by a file stream can't be replayed reliably.
    if (res.status === 401 && getToken && !(options.body instanceof FormData)) {
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
