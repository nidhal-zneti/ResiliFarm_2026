import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API configuration.
 *
 * By default the backend host is derived from the Expo dev server, so the app
 * reaches the FastAPI backend from a browser, an emulator and a physical phone
 * without editing anything. Whatever host served the JS bundle is also the
 * developer machine, which is where the backend runs.
 *
 * To point at a different server, set it explicitly in a `.env` file:
 *
 *   EXPO_PUBLIC_API_URL=https://api.example.com/api/v1
 */
const BACKEND_PORT = 8000;

/** Host of the machine running the backend, as seen from this device. */
function resolveBackendHost(): string {
  // In Expo Go / dev builds the dev server host is the developer machine's
  // address (LAN IP, or 10.0.2.2 for the Android emulator).
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return host;

  // Production builds / fallbacks.
  if (Platform.OS === 'android') return '10.0.2.2'; // Android emulator → host machine
  return 'localhost';
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const API_BASE_URL =
  configuredApiUrl ||
  `http://${resolveBackendHost()}:${BACKEND_PORT}/api/v1`;

/**
 * The app talks to the real backend by default. Mock data is opt-in for demos:
 * set EXPO_PUBLIC_USE_MOCK=true to browse the app without a server running.
 */
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

export const REQUEST_TIMEOUT_MS = 15000;

/** True on a physical device or emulator rather than the browser. */
export const IS_NATIVE = Platform.OS !== 'web';
