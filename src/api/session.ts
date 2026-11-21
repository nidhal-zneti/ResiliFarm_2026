import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { IS_NATIVE } from './config';

/**
 * Session token storage.
 *
 * On a device we use the OS keychain via expo-secure-store; on web we fall back
 * to AsyncStorage (SecureStore is unavailable there).
 */
const TOKEN_KEY = 'resilifarm.token';

export async function getToken(): Promise<string | null> {
  if (IS_NATIVE) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (IS_NATIVE) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (IS_NATIVE) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}
