import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { clearToken, getToken } from './session';

/**
 * A single, centralised HTTP client for the ResiliFarm FastAPI backend.
 *
 * Every API module calls `apiRequest` — screens never call `fetch` directly.
 * It handles the JSON contract, the bearer token, timeouts and the backend's
 * `{ error: { code } }` shape.
 */

export class ApiError extends Error {
  /** Machine-readable code, e.g. 'invalidCredentials', 'unauthenticated'. */
  code: string;
  status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  /** Attach the stored bearer token (default true). */
  auth?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    if (auth) {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    // An expired/invalid session is only one kind of 401; preserve login and
    // password errors such as invalidCredentials for the UI.
    if (response.status === 401) {
      const code = data?.error?.code ?? 'unauthenticated';
      if (code === 'unauthenticated' || code === 'invalidToken') {
        await clearToken();
      }
      throw new ApiError(code, 401);
    }

    if (!response.ok) {
      const code = data?.error?.code ?? `http_${response.status}`;
      throw new ApiError(code, response.status);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ApiError('timeout', 0);
    }
    // Offline, DNS failure, server unreachable...
    throw new ApiError('network', 0);
  } finally {
    clearTimeout(timeout);
  }
}
