/**
 * Unified sign-in — strictly online-first (with retries).
 * Offline credential replica is used ONLY after online attempts are exhausted
 * AND repeated checks confirm there is no data link and the API is unreachable.
 *
 * Backend contracts (Railway cofi-bms-api):
 * - Client: POST /api/v1/client/client-auth/token  JSON { client_id, password }
 * - Staff:  POST /api/v1/auth/token               JSON { email, password, device_type }
 */

import { isNetworkError as isTransportNetworkError } from '@/lib/cache';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import { LOGIN_MAX_ATTEMPTS, retryNetworkOperation } from '@/lib/network-retry';
import {
  markOfflineCredentialUsed,
  upsertOfflineCredential,
  verifyOfflineCredential,
} from '@/lib/offline-auth/credential-store';
import { normalizeEmail } from '@/lib/offline-auth/crypto';
import { shouldAllowOfflineLoginFallback } from '@/lib/offline-auth/login-network-gate';
import { isOfflineSessionExpired } from '@/lib/offline-auth/session-validator';
import type { LoginResult } from '@/lib/offline-auth/types';
import type { AuthUser, UserRole } from '@/store/auth';
import { useAuthStore } from '@/store/auth';

const LOGIN_FETCH_TIMEOUT_MS = 20_000;

const GENERIC_INVALID_CREDENTIALS =
  'Incorrect client ID / email or password. Please try again.';

function normalizeClientLoginId(loginId: string): string {
  return loginId.trim();
}

function isStaffEmailLogin(loginId: string): boolean {
  return loginId.includes('@');
}

function credentialKeyForLogin(loginId: string): string {
  const trimmed = loginId.trim();
  return isStaffEmailLogin(trimmed) ? normalizeEmail(trimmed) : normalizeClientLoginId(trimmed);
}

function isNetworkError(error: unknown): boolean {
  if (isTransportNetworkError(error)) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const name = (error.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('failed to fetch') ||
    msg.includes('connection') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('socket')
  );
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGIN_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Network request timed out');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonLoginResponse(
  res: Response,
  loginUrl: string
): Promise<Record<string, unknown>> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!contentType.includes('application/json') || text.trim().startsWith('<')) {
    throw new Error(`Server returned non-JSON (check API URL: ${loginUrl})`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function parseApiDetail(payload: Record<string, unknown>, fallback: string): string {
  const detail = payload.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === 'string' && first.msg.trim()) return first.msg.trim();
  }
  return fallback;
}

function isGenericCredentialDetail(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    !detail.trim() ||
    d.includes('incorrect email or password') ||
    d.includes('incorrect client id or password') ||
    d.includes('invalid credentials') ||
    d.includes('incorrect username or password')
  );
}

type LoginHttpFailure =
  | { kind: 'invalid_credentials'; message: string }
  | { kind: 'server'; message: string }
  | { kind: 'network'; error: Error };

function classifyLoginHttpFailure(status: number, detail: string): LoginHttpFailure {
  if (status === 401) {
    // Preserve non-credential 401s (inactive, not verified, etc.) so the UI
    // does not falsely claim the password is wrong.
    if (isGenericCredentialDetail(detail)) {
      return { kind: 'invalid_credentials', message: GENERIC_INVALID_CREDENTIALS };
    }
    return { kind: 'server', message: detail };
  }
  if (isTransientHttpStatus(status)) {
    return { kind: 'network', error: new Error(`Network request failed: HTTP ${status}`) };
  }
  return { kind: 'server', message: detail || `Sign-in failed (HTTP ${status}).` };
}

async function tryOnlineClientLogin(
  clientId: string,
  password: string
): Promise<{ token: string; refreshToken?: string; user: AuthUser } | LoginHttpFailure> {
  // Canonical client mobile auth: JSON /client/client-auth/token (not OAuth2 /login form).
  const loginUrl = config.clientAuth.login;
  const res = await fetchWithTimeout(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: normalizeClientLoginId(clientId), password }),
  });

  if (!res.ok) {
    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJsonLoginResponse(res, loginUrl);
    } catch {
      if (isTransientHttpStatus(res.status)) {
        return {
          kind: 'network',
          error: new Error(`Network request failed: HTTP ${res.status}`),
        };
      }
      return {
        kind: 'server',
        message: `Client sign-in failed (HTTP ${res.status}). Check API URL.`,
      };
    }
    return classifyLoginHttpFailure(
      res.status,
      parseApiDetail(payload, 'Incorrect email or password.')
    );
  }

  const data = await parseJsonLoginResponse(res, loginUrl);
  const token = String(data.access_token ?? data.token ?? '');
  if (!token) {
    return { kind: 'invalid_credentials', message: GENERIC_INVALID_CREDENTIALS };
  }

  const refreshToken = data.refresh_token as string | undefined;
  let user: AuthUser = {
    id: 0,
    email: '',
    fullName: String((data.user as { full_name?: string })?.full_name ?? 'Client'),
    role: 'client',
    clientId: normalizeClientLoginId(clientId),
  };

  try {
    const dashRes = await fetchWithTimeout(config.customer.dashboard, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (dashRes.ok) {
      const dash = (await dashRes.json()) as { client_info?: Record<string, unknown> };
      const ci = dash?.client_info;
      if (ci) {
        user = {
          id: (ci.id as number) ?? 0,
          email: String(ci.email ?? ''),
          fullName: String(ci.full_name ?? 'Client'),
          role: 'client',
          phoneNumber: ci.phone_number as string | undefined,
          clientId: String(ci.client_id ?? normalizeClientLoginId(clientId)),
        };
      }
    }
  } catch {
    /* keep base user — token issuance is authoritative */
  }

  return { token, refreshToken, user };
}

async function tryOnlineStaffLogin(
  email: string,
  password: string
): Promise<{ token: string; refreshToken?: string; user: AuthUser } | LoginHttpFailure> {
  // Canonical staff mobile auth: JSON /auth/token with device_type=mobile_app.
  const loginUrl = config.staffAuth.login;
  const res = await fetchWithTimeout(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email,
      password,
      device_type: 'mobile_app',
    }),
  });

  if (!res.ok) {
    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJsonLoginResponse(res, loginUrl);
    } catch {
      if (isTransientHttpStatus(res.status)) {
        return {
          kind: 'network',
          error: new Error(`Network request failed: HTTP ${res.status}`),
        };
      }
      return {
        kind: 'server',
        message: `Staff sign-in failed (HTTP ${res.status}). Check API URL.`,
      };
    }
    return classifyLoginHttpFailure(
      res.status,
      parseApiDetail(payload, 'Incorrect email or password.')
    );
  }

  const data = await parseJsonLoginResponse(res, loginUrl);
  const token = String(data.access_token ?? data.token ?? '');
  if (!token) {
    return { kind: 'invalid_credentials', message: GENERIC_INVALID_CREDENTIALS };
  }

  const refreshToken = data.refresh_token as string | undefined;
  let user: AuthUser = {
    id: 0,
    email,
    fullName: String((data.user as { full_name?: string })?.full_name ?? 'Staff'),
    role: 'staff',
  };

  try {
    const meRes = await fetchWithTimeout(config.staffAuth.me, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as Record<string, unknown>;
      user = {
        id: (me.id as number) ?? 0,
        email: String(me.email ?? email),
        fullName: String((me.full_name ?? me.fullName ?? email) || 'Staff'),
        role: 'staff',
        employeeId: me.employee_id as string | undefined,
        branchId: me.branch_id as number | undefined,
        bankId: me.bank_id as number | undefined,
        backendRole: typeof me.role === 'string' ? me.role : undefined,
        creditBook: typeof me.credit_book === 'string' ? me.credit_book : undefined,
      };
    }
  } catch {
    /* keep base user — token issuance is authoritative */
  }

  return { token, refreshToken, user };
}

async function completeOnlineLogin(
  loginId: string,
  password: string,
  role: UserRole,
  token: string,
  refreshToken: string | undefined,
  user: AuthUser
): Promise<LoginResult> {
  const now = new Date().toISOString();
  const credentialKey = credentialKeyForLogin(loginId);

  useAuthStore.setState({
    sessionMode: 'online',
    lastOnlineValidatedAt: now,
    pendingServerValidation: false,
  });
  await useAuthStore.getState().setAuth(user, token, refreshToken ?? null);

  try {
    await upsertOfflineCredential({
      email: credentialKey,
      password,
      role,
      user,
      token,
      refreshToken,
    });
  } catch (error) {
    logger.error(
      'Failed to cache offline credentials',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'auth-service' }
    );
  }

  return { success: true, role, mode: 'online' };
}

async function attemptOfflineLogin(
  email: string,
  password: string,
  opts?: { afterNetworkFailure?: boolean }
): Promise<LoginResult> {
  const verified = await verifyOfflineCredential(email, password);
  if (!verified) {
    return {
      success: false,
      error: opts?.afterNetworkFailure
        ? 'Unable to reach the sign-in server. Check your internet connection and try again.'
        : 'No offline sign-in available. Connect once while online to enable offline access, or check your credentials.',
      code: opts?.afterNetworkFailure ? 'network' : 'no_offline_cache',
    };
  }

  const { record, role } = verified;

  if (isOfflineSessionExpired(record.lastOnlineAuthAt)) {
    return {
      success: false,
      error: 'Offline access expired. Connect to the internet to sign in again.',
      code: 'offline_expired',
    };
  }

  const token = record.storedToken;
  if (!token) {
    return {
      success: false,
      error: 'Offline session unavailable. Sign in once while online on this device.',
      code: 'no_offline_cache',
    };
  }

  useAuthStore.setState({
    sessionMode: 'offline',
    lastOnlineValidatedAt: record.lastOnlineAuthAt,
    pendingServerValidation: true,
  });
  await useAuthStore.getState().setAuth(record.userSnapshot, token, record.storedRefreshToken);

  await markOfflineCredentialUsed(email);

  return {
    success: true,
    role,
    mode: 'offline',
    notice: 'Signed in offline. Your session will be verified automatically when you reconnect.',
  };
}

async function maybeAttemptOfflineLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  // Hard online-first guard: if the OS still has a data link, never flip to offline.
  const hasLink = await networkManager.hasDataLink();
  if (hasLink) {
    logger.info('Offline login blocked: data link present after online failures', {
      module: 'auth-service',
    });
    return {
      success: false,
      error:
        'Unable to reach the sign-in server. Your connection looks available — please try again in a moment.',
      code: 'network',
    };
  }

  const allowOffline = await shouldAllowOfflineLoginFallback();
  if (!allowOffline) {
    return {
      success: false,
      error:
        'Unable to reach the sign-in server. Your connection looks available — please try again in a moment.',
      code: 'network',
    };
  }
  return attemptOfflineLogin(email, password, { afterNetworkFailure: true });
}

type OnlineLoginAttempt =
  | { kind: 'success'; result: LoginResult }
  | { kind: 'invalid_credentials'; message: string }
  | { kind: 'server'; message: string }
  | { kind: 'network' };

type EndpointOutcome =
  | { kind: 'success'; token: string; refreshToken?: string; user: AuthUser; role: UserRole }
  | LoginHttpFailure;

async function runClientEndpoint(email: string, password: string): Promise<EndpointOutcome> {
  try {
    const client = await tryOnlineClientLogin(email, password);
    if ('token' in client) {
      return { kind: 'success', role: 'client', ...client };
    }
    return client;
  } catch (error) {
    return {
      kind: 'network',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function runStaffEndpoint(email: string, password: string): Promise<EndpointOutcome> {
  try {
    const staff = await tryOnlineStaffLogin(email, password);
    if ('token' in staff) {
      return { kind: 'success', role: 'staff', ...staff };
    }
    return staff;
  } catch (error) {
    return {
      kind: 'network',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

type OnlineFailureSummary = {
  server?: string;
  network: boolean;
  invalidCredentials?: string;
};

function recordOnlineFailure(summary: OnlineFailureSummary, failure: LoginHttpFailure): void {
  if (failure.kind === 'server') {
    summary.server ??= failure.message;
    return;
  }
  if (failure.kind === 'network') {
    summary.network = true;
    return;
  }
  summary.invalidCredentials ??= failure.message;
}

function summarizeOnlineFailures(summary: OnlineFailureSummary): OnlineLoginAttempt {
  // An account-state message (not verified, device blocked) is the most actionable.
  // Transport trouble outranks a rejection, so a single endpoint answering 401
  // while the other never responded is never reported as a wrong password.
  if (summary.server !== undefined) {
    return { kind: 'server', message: summary.server };
  }
  if (summary.network) {
    return { kind: 'network' };
  }
  return {
    kind: 'invalid_credentials',
    message: summary.invalidCredentials || GENERIC_INVALID_CREDENTIALS,
  };
}

async function attemptOnlineLoginOnce(
  loginId: string,
  password: string
): Promise<OnlineLoginAttempt> {
  const trimmed = loginId.trim();

  // Borrowers sign in with a client ID and staff with an email, but the sign-in
  // field accepts either. Ask both services rather than picking one from the
  // shape of the text: routing on "@" alone locks a valid account out of online
  // sign-in whenever the identifier is not in the form we guessed.
  const endpoints: Array<() => Promise<EndpointOutcome>> = [
    () => runClientEndpoint(trimmed, password),
    () => runStaffEndpoint(normalizeEmail(trimmed), password),
  ];

  const failures: OnlineFailureSummary = { network: false };

  for (const runEndpoint of endpoints) {
    const outcome = await runEndpoint();
    if (outcome.kind === 'success') {
      const result = await completeOnlineLogin(
        trimmed,
        password,
        outcome.role,
        outcome.token,
        outcome.refreshToken,
        outcome.user
      );
      return { kind: 'success', result };
    }
    recordOnlineFailure(failures, outcome);
  }

  return summarizeOnlineFailures(failures);
}

async function attemptOnlineLoginWithRetries(
  loginId: string,
  password: string
): Promise<OnlineLoginAttempt> {
  try {
    return await retryNetworkOperation(() => attemptOnlineLoginOnce(loginId, password), {
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      label: 'signIn',
      baseDelayMs: 700,
    });
  } catch (error) {
    if (isNetworkError(error)) {
      return { kind: 'network' };
    }
    throw error;
  }
}

/**
 * Sign in with online-first strategy.
 * Always tries the server first (client + staff endpoints, with retries).
 * Offline credentials are used only after online attempts are exhausted AND
 * repeated network checks confirm the device truly cannot reach the API.
 */
export async function signInWithOfflineSupport(
  loginId: string,
  password: string
): Promise<LoginResult> {
  const trimmed = loginId.trim();
  if (!trimmed || !password.trim()) {
    return {
      success: false,
      error: 'Client ID or email and password are required.',
      code: 'invalid_credentials',
    };
  }

  const credentialKey = credentialKeyForLogin(trimmed);

  // Prefer online whenever a data link exists — never start in offline mode.
  const hasLinkAtStart = await networkManager.hasDataLink();
  if (hasLinkAtStart) {
    void networkManager.forceRefresh().catch(() => undefined);
  }

  logger.info('Sign-in starting (online-first)', {
    module: 'auth-service',
    hasDataLink: hasLinkAtStart,
    clientAuthUrl: config.clientAuth.login,
    staffAuthUrl: config.staffAuth.login,
  });

  try {
    const online = await attemptOnlineLoginWithRetries(trimmed, password);

    if (online.kind === 'success') {
      return online.result;
    }
    if (online.kind === 'invalid_credentials') {
      return {
        success: false,
        error: online.message || GENERIC_INVALID_CREDENTIALS,
        code: 'invalid_credentials',
      };
    }
    if (online.kind === 'server') {
      return { success: false, error: online.message, code: 'server' };
    }

    logger.info('Online login unreachable after retries; evaluating offline fallback', {
      module: 'auth-service',
    });
    return maybeAttemptOfflineLogin(credentialKey, password);
  } catch (error) {
    if (!isNetworkError(error)) {
      const msg = error instanceof Error ? error.message : 'Sign in failed.';
      return { success: false, error: msg, code: 'server' };
    }
    logger.info('Online login failed with network error; evaluating offline fallback', {
      module: 'auth-service',
    });
    return maybeAttemptOfflineLogin(credentialKey, password);
  }
}
