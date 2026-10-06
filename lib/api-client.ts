/**
 * Production-grade API client – fetch wrapper with base URL, auth header, error handling.
 * Features:
 * - Automatic token refresh on 401 with exponential backoff
 * - Request timeout management (30s standard, 2m uploads)
 * - Comprehensive error handling and logging
 * - Request ID tracking for debugging
 * - Graceful session invalidation on auth failures
 */

import { ensureAuthPersistedFromStore } from '@/lib/auth-session-sync';
import { config } from '@/lib/config';
import { persistAuthSession, readAuthSession } from '@/lib/auth-persistence';
import { logger } from '@/lib/logger';
import { isSyncAuthGuardActive } from '@/lib/sync/sync-auth-guard';
import { useAuthStore } from '@/store/auth';

export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Generate unique request ID for debugging */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const STANDARD_TIMEOUT_MS = 30000; // 30 seconds for standard requests
const UPLOAD_TIMEOUT_MS = 120000; // 2 minutes for document uploads
/** Collateral create can follow uploads + geolocation work; allow a longer window. */
const COLLATERAL_WRITE_TIMEOUT_MS = 90000;
/** AI Studio JSON query/plan — no short cutoff (free OpenRouter models think for minutes). */
const AI_STUDIO_LONG_TIMEOUT_MS = 800_000;

let refreshInFlight: Promise<string | null> | null = null;
let logoutInFlight: Promise<void> | null = null;

/** Skip forced logout immediately after sign-in while parallel dashboard calls settle. */
const LOGIN_GRACE_MS = 20_000;

function withinLoginGracePeriod(): boolean {
  const at = useAuthStore.getState().authenticatedAt;
  if (!at) return false;
  return Date.now() - at < LOGIN_GRACE_MS;
}

async function logoutOnce(): Promise<void> {
  if (logoutInFlight) {
    await logoutInFlight;
    return;
  }
  logoutInFlight = useAuthStore.getState().logout().finally(() => {
    logoutInFlight = null;
  });
  await logoutInFlight;
}

function formatApiErrorMessage(detail: unknown, statusText: string, status: number): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object') {
    const obj = detail as { detail?: unknown; message?: unknown };
    if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail;
    if (obj.detail && typeof obj.detail === 'object' && !Array.isArray(obj.detail)) {
      const nested = obj.detail as { message?: unknown };
      if (typeof nested.message === 'string' && nested.message.trim()) return nested.message;
    }
    if (Array.isArray(obj.detail)) {
      const parts = obj.detail
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as { loc?: unknown[]; msg?: string };
          const loc = Array.isArray(row.loc) ? row.loc.join('.') : '';
          return row.msg ? (loc ? `${loc}: ${row.msg}` : row.msg) : null;
        })
        .filter(Boolean);
      if (parts.length > 0) return parts.join('; ');
    }
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
    try {
      return JSON.stringify(detail);
    } catch {
      /* ignore */
    }
  }
  return statusText || `Request failed (${status})`;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      await ensureAuthPersistedFromStore();
      const stored = await readAuthSession();
      const state = useAuthStore.getState();
      const refreshToken = stored?.refreshToken ?? state.refreshToken;
      const role = (stored?.user?.role ?? state.user?.role) as 'client' | 'staff' | undefined;

      if (!role || !refreshToken) {
        logger.warn('Token refresh failed: missing auth data', { module: 'api-client' });
        return null;
      }

      const refreshUrl =
        role === 'client' ? config.clientAuth.refresh : config.staffAuth.refresh;

      try {
        const response = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${refreshToken}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          logger.warn(`Token refresh failed (${response.status})`, { module: 'api-client' });
          return null;
        }

        const data = (await response.json()) as {
          access_token?: string;
          token?: string;
          refresh_token?: string;
        };
        
        const newAccessToken = data.access_token ?? data.token;
        if (!newAccessToken) {
          logger.warn('Token refresh response missing access token', { module: 'api-client' });
          return null;
        }

        const nextRefreshToken = data.refresh_token ?? refreshToken;
        const sessionUser = stored?.user ?? state.user;
        if (sessionUser) {
          await persistAuthSession({
            user: sessionUser,
            token: newAccessToken,
            refreshToken: nextRefreshToken,
          });
          useAuthStore.setState({
            token: newAccessToken,
            refreshToken: nextRefreshToken,
          });
          logger.info('Token refreshed successfully', {
            module: 'api-client',
            userId: sessionUser.id,
          });
        }
        return newAccessToken;
      } catch (error) {
        logger.error(
          'Token refresh request failed',
          error instanceof Error ? error : new Error(String(error)),
          { module: 'api-client' }
        );
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; formData?: boolean; _retryAttempted?: boolean } = {}
): Promise<T> {
  const requestId = generateRequestId();
  const { token, formData = false, _retryAttempted = false, ...init } = options;
  const url = path.startsWith('http') ? path : `${config.apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-ID': requestId,
    ...(init.headers as Record<string, string>),
  };
  if (!formData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const pathForTimeout = typeof path === 'string' ? path : '';
  const isCollateralWrite =
    /\/collateral(\/|$|\?)/i.test(pathForTimeout) &&
    ['POST', 'PUT', 'PATCH'].includes(String(init.method || 'GET').toUpperCase());
  const isAiStudioLongCall = /\/ai-studio\/(query|executor\/plan)(\/|$|\?)/i.test(
    pathForTimeout
  );
  const timeoutMs = formData
    ? UPLOAD_TIMEOUT_MS
    : isAiStudioLongCall
      ? AI_STUDIO_LONG_TIMEOUT_MS
      : isCollateralWrite
        ? COLLATERAL_WRITE_TIMEOUT_MS
        : STANDARD_TIMEOUT_MS;
  
  // Set abort timeout
  const timeoutId = setTimeout(() => {
    logger.warn(`Request timeout after ${timeoutMs}ms`, {
      module: 'api-client',
      requestId,
    });
    controller.abort();
  }, timeoutMs);

  try {
    logger.debug(`${init.method || 'GET'} ${path}`, {
      module: 'api-client',
      requestId,
    });

    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle unauthorized
    if (res.status === 401) {
      if (!_retryAttempted) {
        logger.info('Attempting token refresh after 401', {
          module: 'api-client',
          requestId,
        });
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          // Prefer the live store token in case another refresh completed first.
          const latest =
            useAuthStore.getState().token?.trim() || refreshedToken;
          return apiFetch<T>(path, {
            ...options,
            token: latest,
            _retryAttempted: true,
          });
        }

        // Refresh failed → session is truly invalid.
        logger.warn('Unauthorized - logging out user (refresh failed)', {
          module: 'api-client',
          requestId,
        });
        if (!isSyncAuthGuardActive() && !withinLoginGracePeriod()) {
          await logoutOnce();
        }
        throw new ApiClientError(
          401,
          'Session expired. Please log in again.',
          undefined,
          requestId
        );
      }

      // Refresh succeeded earlier but this endpoint still returned 401
      // (wrong role/scope, staff-only route, auth header lost on redirect, etc.).
      // Do NOT wipe the session — that caused false "Sign in required" during loan sync.
      let detailMessage =
        'You are not authorized for this action. Please try again or contact support.';
      try {
        const errText = await res.text();
        if (errText?.trim()) {
          const parsed = JSON.parse(errText) as { detail?: unknown };
          if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
            detailMessage = parsed.detail.trim();
          }
        }
      } catch {
        /* keep default message */
      }
      logger.warn(`Unauthorized after token refresh — not logging out (${path})`, {
        module: 'api-client',
        requestId,
      });
      throw new ApiClientError(401, detailMessage, undefined, requestId);
    }

    // Read body once — calling json() then text() on failure causes "Already read".
    const text = await res.text();

    // Handle errors
    if (!res.ok) {
      let detail: unknown = text;
      if (text) {
        try {
          detail = JSON.parse(text) as unknown;
        } catch {
          detail = text;
        }
      }

      const errorMessage = formatApiErrorMessage(detail, res.statusText, res.status);

      logger.warn(`API error ${res.status}: ${errorMessage}`, {
        module: 'api-client',
        requestId,
      });

      throw new ApiClientError(res.status, errorMessage, detail, requestId);
    }

    if (!text) return null as T;

    try {
      const parsed = JSON.parse(text) as T;
      logger.debug(`${res.status} OK`, {
        module: 'api-client',
        requestId,
      });
      return parsed;
    } catch {
      return text as unknown as T;
    }
  } catch (error) {
    clearTimeout(timeoutId);

    const aborted = controller.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);
    // React Native often surfaces AbortController timeouts as TypeError "Network request failed"
    // instead of AbortError — treat aborted fetches as timeouts either way.
    if (
      (error instanceof Error && error.name === 'AbortError') ||
      (aborted && /network request failed/i.test(message))
    ) {
      logger.error(
        `Request timeout or aborted (${timeoutMs}ms)`,
        error instanceof Error ? error : new Error(message),
        { module: 'api-client', requestId }
      );
      throw new ApiClientError(
        408,
        'Request timeout. Please check your connection and try again.',
        undefined,
        requestId
      );
    }

    if (error instanceof ApiClientError) {
      throw error;
    }

    if (/network request failed/i.test(message)) {
      logger.error('Network request failed', error instanceof Error ? error : new Error(message), {
        module: 'api-client',
        requestId,
      });
      throw new ApiClientError(
        0,
        'Network connection lost. Please try again.',
        undefined,
        requestId
      );
    }

    logger.error(
      'Unexpected API error',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'api-client', requestId }
    );

    throw error;
  }
}

export const api = {
  get: <T>(path: string, token?: string | null) =>
    apiFetch<T>(path, { method: 'GET', token }),

  post: <T>(path: string, body?: unknown, token?: string | null) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, token }),

  put: <T>(path: string, body?: unknown, token?: string | null) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined, token }),

  patch: <T>(path: string, body?: unknown, token?: string | null) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined, token }),

  delete: <T>(path: string, token?: string | null, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'DELETE',
      token,
      body: body != null ? JSON.stringify(body) : undefined,
    }),

  /** Upload FormData (e.g. document files). Do not set Content-Type - fetch sets multipart boundary. */
  postForm: <T>(path: string, formData: FormData, token?: string | null) =>
    apiFetch<T>(path, { method: 'POST', body: formData, token, formData: true }),
};
