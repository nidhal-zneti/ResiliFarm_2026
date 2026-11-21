import { Platform } from 'react-native';

/**
 * API configuration.
 *
 * The base URL comes from the environment so the same code works against a
 * local backend, a staging server or production. Set it in a `.env` file:
 *
 *   EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api/v1
 *
 * Android emulators cannot reach the host via `localhost` — use 10.0.2.2.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

/**
 * While the farmer endpoints are being built, the app runs on clearly-labelled
 * mock data. Set EXPO_PUBLIC_USE_MOCK=false once the backend is ready.
 */
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK !== 'false';

export const REQUEST_TIMEOUT_MS = 15000;

/** True on a physical device or emulator rather than the browser. */
export const IS_NATIVE = Platform.OS !== 'web';
