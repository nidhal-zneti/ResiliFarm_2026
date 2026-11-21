import type { Role, User } from '@/types';

import { toUser } from './auth';
import { apiRequest } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockUser } from './mock';

/** Farmer profile. */

type ApiUser = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  created_at?: string;
};

export async function getProfile(): Promise<User> {
  if (USE_MOCK) {
    await mockDelay();
    return mockUser;
  }
  const data = await apiRequest<ApiUser>('/auth/me');
  return toUser(data);
}

export async function updateProfile(input: {
  fullName: string;
  email: string;
}): Promise<User> {
  if (USE_MOCK) {
    await mockDelay();
    return { ...mockUser, fullName: input.fullName, email: input.email };
  }
  const data = await apiRequest<ApiUser>('/auth/profile', {
    method: 'POST',
    body: { full_name: input.fullName, email: input.email },
  });
  return toUser(data);
}
