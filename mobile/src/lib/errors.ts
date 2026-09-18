import { isClerkAPIResponseError } from '@clerk/expo';
import { ApiError } from '@/api/client';

const FALLBACK = 'Something went wrong. Please try again.';

/** Human-readable message for Clerk, backend (ApiError) and unknown errors. */
export function getErrorMessage(err: unknown, fallback = FALLBACK): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first?.longMessage || first?.message || fallback;
  }
  if (err instanceof ApiError) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { longMessage?: unknown; message?: unknown };
    if (typeof e.longMessage === 'string' && e.longMessage) return e.longMessage;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return fallback;
}

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * Message for the form-level banner, or null if every error is already shown inline.
 *
 * Clerk's `useSignIn()/useSignUp()` expose `errors.fields.<name>` only for API errors whose
 * `paramName` matches a known field; other errors would otherwise be silently dropped.
 * Pass the field names you render inline (e.g. ['identifier', 'password']).
 */
export function getBannerMessage(err: unknown, inlineFields: readonly string[]): string | null {
  if (!err) return null;
  if (isClerkAPIResponseError(err)) {
    const leftover = err.errors.filter(
      (e) => !(e.meta?.paramName && inlineFields.includes(toCamel(e.meta.paramName))),
    );
    if (!leftover.length) return null;
    return leftover[0].longMessage || leftover[0].message;
  }
  return getErrorMessage(err);
}
