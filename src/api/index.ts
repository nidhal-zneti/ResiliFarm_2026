/**
 * Centralised API service layer for the ResiliFarm FastAPI backend.
 *
 * Screens import from `@/api` and never call `fetch` directly. Each module owns
 * one domain, and mock data lives separately in `./mock` so it can be removed
 * without touching the production code.
 */
export * as auth from './auth';
export * as profile from './profile';
export * as farms from './farms';
export * as irrigation from './irrigation';
export * as weather from './weather';
export * as water from './water';
export * as schedule from './schedule';
export * as notifications from './notifications';
export * as home from './home';

export { ApiError } from './client';
export { API_BASE_URL, USE_MOCK } from './config';
