import type { Locale, Role, User } from '@/types';

import { ApiError, apiRequest } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockUser } from './mock';
import { clearToken, setToken } from './session';

/** Authentication & account endpoints. */

type ApiUser = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  created_at?: string;
};

type ApiAuthResponse = { token: string; user: ApiUser };

/** Convert the backend's snake_case user into the app's User shape. */
export function toUser(user: ApiUser, locale: Locale = 'fr'): User {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    locale,
  };
}

export async function signIn(email: string, password: string): Promise<User> {
  if (USE_MOCK) {
    await mockDelay();
    await setToken('demo-token');
    return { ...mockUser, email };
  }
  const data = await apiRequest<ApiAuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  await setToken(data.token);
  return toUser(data.user);
}

export async function signUp(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<User> {
  if (USE_MOCK) {
    await mockDelay();
    await setToken('demo-token');
    return { ...mockUser, fullName: input.fullName, email: input.email };
  }
  // The server always assigns the FARMER role on sign-up; the client never sends a role.
  const data = await apiRequest<ApiAuthResponse>('/auth/signup', {
    method: 'POST',
    body: { full_name: input.fullName, email: input.email, password: input.password },
    auth: false,
  });
  await setToken(data.token);
  return toUser(data.user);
}

export async function signOut(): Promise<void> {
  await clearToken();
}

/**
 * Password recovery.
 *
 * Placeholder: the backend does not expose a reset endpoint yet. In mock mode it
 * resolves so the UI flow can be built; otherwise it reports that the feature is
 * not available rather than pretending to have sent an email.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    return;
  }
  void email;
  throw new ApiError('notAvailable', 501);
}

export { ApiError };
