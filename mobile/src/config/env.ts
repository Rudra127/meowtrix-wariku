/**
 * Runtime configuration. Every EXPO_PUBLIC_* variable is read here and nowhere else.
 * Note: Expo inlines `process.env.EXPO_PUBLIC_*` at build time — access them statically (no destructuring).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BACKEND_PORT = 5947;

export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  if (__DEV__) {
    // `hostUri` is "<LAN-IP>:8081" — the computer running Metro, which is also running the backend.
    // Works for simulators/emulators and physical phones on the same network.
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host) return `http://${host}:${BACKEND_PORT}/api/v1`;
    return Platform.OS === 'android'
      ? `http://10.0.2.2:${BACKEND_PORT}/api/v1` // Android emulator → host machine
      : `http://localhost:${BACKEND_PORT}/api/v1`;
  }

  console.error('EXPO_PUBLIC_API_URL must be set for production builds');
  return '';
}

export const API_URL = resolveApiUrl();
