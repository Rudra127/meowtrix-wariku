import { useSSO } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Button } from '@/components/ui';
import { colors } from '@/theme';
import { getErrorMessage } from '@/lib/errors';

// Completes the auth session when the OAuth browser redirects back into the app (web + Android).
WebBrowser.maybeCompleteAuthSession();

/** Pre-warms the Android custom tab so the OAuth sheet opens instantly. */
function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

type Props = { onError: (message: string | null) => void };

/**
 * "Continue with Google" via Clerk SSO (works for both sign-in and sign-up).
 * Requires Google enabled in Clerk → SSO connections, and the app's redirect URL allow-listed
 * (Clerk → Native applications). See docs/AUTH.md.
 */
export function GoogleSignInButton({ onError }: Props) {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState(false);

  const onPress = async () => {
    onError(null);
    setLoading(true);
    try {
      // redirectUrl defaults to `<scheme>://sso-callback` (or exp://.../--/sso-callback in Expo Go).
      const { createdSessionId, setActive, authSessionResult } = await startSSOFlow({ strategy: 'oauth_google' });
      if (createdSessionId) {
        await setActive?.({ session: createdSessionId });
        // Root layout's Stack.Protected guard navigates to the tabs once the session is active.
      } else if (authSessionResult?.type === 'success') {
        // Returned from Google but Clerk needs more info (e.g. a required username/phone).
        onError('Your account needs extra details to finish signing up. Please use email sign-up.');
      }
      // Otherwise the user cancelled the browser sheet — nothing to do.
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      title="Continue with Google"
      variant="secondary"
      loading={loading}
      onPress={onPress}
      icon={<Ionicons name="logo-google" size={18} color={colors.text} />}
    />
  );
}
