import { Redirect } from 'expo-router';
import { useTheme } from '@/theme';

/**
 * Landing route for the OAuth redirect (`wariku://sso-callback`). The SSO flow itself is finished
 * inside `useSSO()`; if the OS also opens this deep link, just bounce to the right place.
 */
export default function SSOCallback() {
  useTheme(); // re-render on light/dark switch
  return <Redirect href="/" />;
}
