/**
 * Connecting a brokerage account (Upstox, Zerodha). Provider-agnostic — the backend does all the
 * secret handling; the app only opens a browser.
 *
 *   GET /integrations/:provider/login-url  → a broker login URL with a signed, 10-minute state
 *   openAuthSessionAsync(url, 'wariku://broker-callback')
 *   user signs in at the broker → broker redirects to our backend callback
 *   backend swaps the code for an access token, stores it encrypted, then 302s to
 *   wariku://broker-callback?provider=<p>&status=connected — closing the browser and landing here
 *
 * The app never sees the broker API secret or the access token. Holdings are only ever read by the
 * AI assistant (backend/services/ai-tools.js), never fetched here.
 */
import { useAuth } from '@clerk/expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { integrationsApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { BrokerProvider } from '@/api/types';
import { useApi } from '@/api/useApi';
import { getErrorMessage } from '@/lib/errors';

/** Must match the backend deep link and `expo.scheme` in app.json. */
export const BROKER_RETURN_PATH = 'broker-callback';

export type ConnectOutcome =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | { ok: null; message: null }; // dismissed without finishing

/** Human wording for each `status` the backend can send back. */
const OUTCOMES: Record<string, { ok: boolean; message: string }> = {
  connected: { ok: true, message: 'Connected. Ask the AI about your holdings.' },
  cancelled: { ok: false, message: 'Sign-in was cancelled.' },
  link_expired: { ok: false, message: 'That connection link expired. Please try again.' },
  failed: { ok: false, message: "Couldn't connect. Please try again." },
};

/**
 * Groww's status. Read-only and server-configured: there is no connect flow to drive, so unlike
 * `useBrokerage` this is a plain query with no mutations.
 */
export function useGrowwStatus() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: queryKeys.integrations.groww,
    queryFn: () => integrationsApi.growwStatus(api),
    enabled: !!isSignedIn,
  });
}

export function useBrokerage(provider: BrokerProvider) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [isConnecting, setConnecting] = useState(false);

  const refreshStatus = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all }),
    [queryClient],
  );

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    setConnecting(true);
    try {
      const { url } = await integrationsApi.loginUrl(api, provider);
      const returnUrl = Linking.createURL(`/${BROKER_RETURN_PATH}`);

      // openAuthSessionAsync watches for `returnUrl` and closes the browser itself, so the happy
      // path never needs the deep-link route to fire.
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);

      if (result.type !== 'success') {
        // 'cancel' / 'dismiss' — the user backed out. The callback may still have completed
        // server-side, so re-check either way.
        await refreshStatus();
        return { ok: null, message: null };
      }

      const returned = Linking.parse(result.url).queryParams ?? {};
      const key = typeof returned.status === 'string' ? returned.status : 'failed';
      const label = OUTCOMES[key]?.message ?? (typeof returned.message === 'string' ? returned.message : OUTCOMES.failed.message);
      const outcome = OUTCOMES[key] ? { ...OUTCOMES[key], message: label } : { ok: false, message: label };

      await refreshStatus();
      return outcome;
    } catch (err) {
      return { ok: false, message: getErrorMessage(err) };
    } finally {
      setConnecting(false);
    }
  }, [api, provider, refreshStatus]);

  const disconnect = useMutation({
    mutationFn: () => integrationsApi.disconnect(api, provider),
    onSuccess: refreshStatus,
  });

  return { connect, isConnecting, disconnect, refreshStatus };
}
