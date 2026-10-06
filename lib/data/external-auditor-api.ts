import { config } from '@/lib/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'cofi.external_auditor.token';
const SESSION_KEY = 'cofi.external_auditor.session';

export type ExternalAuditorSession = {
  access_id: number;
  external_auditor_name: string;
  bank_id: number;
  scope_config?: Record<string, unknown>;
  expires_at?: string | null;
};

export type ExternalDashboardMetrics = {
  total_loans?: number;
  total_disbursed?: number;
  outstanding_balance?: number;
  par_ratio?: number;
  aging_buckets?: Record<string, number>;
  disbursed_ytd?: number;
};

export type ExternalLoanPerformance = {
  total_loans?: number;
  total_disbursed?: number;
  outstanding_balance?: number;
  par_ratio?: number;
  aging_buckets?: Record<string, number>;
};

export type ExternalAging = {
  total_aging_clients?: number;
  buckets?: Record<string, number>;
  high_risk_watchlist?: Array<{
    loan_id?: number;
    client_name?: string;
    days_in_arrears?: number;
    outstanding?: number;
  }>;
};

export type ExternalLiquidity = {
  cash_position?: number;
  loan_to_deposit_ratio?: number;
  liquidity_ratio?: number;
};

export type ExternalClient = {
  id: number;
  display_name?: string;
  phone_number?: string | null;
  kyc_status?: string | null;
};

async function externalFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-External-Access-Token': token,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401) {
    await clearExternalAuditorSession();
    throw new Error('External auditor session expired. Sign in again.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getExternalAuditorToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getExternalAuditorSession(): Promise<ExternalAuditorSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExternalAuditorSession;
  } catch {
    return null;
  }
}

export async function persistExternalAuditorSession(
  token: string,
  session: ExternalAuditorSession
): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [SESSION_KEY, JSON.stringify(session)],
  ]);
}

export async function clearExternalAuditorSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, SESSION_KEY]);
}

export async function apiExternalAuditorLogin(accessToken: string): Promise<ExternalAuditorSession> {
  const res = await fetch(config.staff.externalAuditorLogin, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken.trim() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Invalid or expired access token');
  }
  const data = (await res.json()) as ExternalAuditorSession;
  await persistExternalAuditorSession(accessToken.trim(), data);
  return data;
}

export async function apiGetExternalAuditorDashboard(
  token: string
): Promise<ExternalDashboardMetrics> {
  return externalFetch(config.staff.externalAuditorDashboard, token);
}

export async function apiGetExternalAuditorLoanPerformance(
  token: string
): Promise<ExternalLoanPerformance> {
  return externalFetch(config.staff.externalAuditorLoanPerformance, token);
}

export async function apiGetExternalAuditorAging(token: string): Promise<ExternalAging> {
  return externalFetch(config.staff.externalAuditorAging, token);
}

export async function apiGetExternalAuditorLiquidity(token: string): Promise<ExternalLiquidity> {
  return externalFetch(config.staff.externalAuditorRiskLiquidity, token);
}

export async function apiGetExternalAuditorClients(
  token: string,
  search?: string
): Promise<{ items?: ExternalClient[]; total?: number }> {
  const q = search ? `?search=${encodeURIComponent(search)}&limit=30` : '?limit=30';
  return externalFetch(`${config.staff.externalAuditorClients}${q}`, token);
}
