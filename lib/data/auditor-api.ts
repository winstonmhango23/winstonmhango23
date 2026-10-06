import { api } from '@/lib/api-client';
import { config } from '@/lib/config';
import { performanceMonitor } from '@/lib/performance-monitor';

export type ApiAuditorDashboardMetrics = {
  total_events_7d?: number;
  total_events_30d?: number;
  total_events_90d?: number;
  pending_reviews?: number;
  open_findings?: number;
  compliance_flags?: number;
  loan_performance_alerts?: number;
  events_by_category?: Record<string, number>;
};

export type ApiAuditorLoanPerformance = {
  total_loans?: number;
  total_disbursed?: number;
  outstanding_balance?: number;
  par_ratio?: number;
  aging_buckets?: Record<string, number>;
};

export type ApiAuditorAging = {
  total_aging_clients?: number;
  buckets?: Record<string, number>;
  high_risk_watchlist?: Array<{
    loan_id?: number;
    client_name?: string;
    days_in_arrears?: number;
    outstanding?: number;
    status?: string;
  }>;
};

export type ApiAuditorFinding = {
  id: number;
  title: string;
  description?: string | null;
  severity: string;
  category: string;
  status: string;
  source_type?: string | null;
  source_reference?: string | null;
  assigned_to?: number | null;
  resolution_notes?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
};

export type ApiAuditorFindingPage = {
  items?: ApiAuditorFinding[];
  total?: number;
  page?: number;
  limit?: number;
};

export type ApiAuditorTrailEntry = {
  id: number;
  action_category?: string;
  action_type?: string;
  description?: string | null;
  staff_id?: number | null;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
};

export type ApiAuditorTrailPage = {
  items?: ApiAuditorTrailEntry[];
  total?: number;
  page?: number;
  limit?: number;
};

export type ApiAuditorStatistics = {
  total_findings?: number;
  open_findings?: number;
  resolved_findings?: number;
  by_severity?: Record<string, number>;
  by_category?: Record<string, number>;
  coverage_percentage?: number;
};

export type ApiAuditorClient = {
  id: number;
  display_name?: string;
  phone_number?: string | null;
  email?: string | null;
  kyc_status?: string | null;
};

export type ApiAuditorClientPage = {
  items?: ApiAuditorClient[];
  total?: number;
  page?: number;
  limit?: number;
};

function wrapWithPerf<T>(name: string, fn: () => Promise<T>): Promise<T> {
  performanceMonitor.mark(name);
  return fn().finally(() => {
    performanceMonitor.measure(name);
  });
}

export async function apiGetAuditorDashboard(token: string): Promise<ApiAuditorDashboardMetrics | null> {
  return wrapWithPerf('apiGetAuditorDashboard', async () => {
    return (await api.get<ApiAuditorDashboardMetrics>(config.staff.auditorDashboardMetrics, token)) ?? null;
  });
}

export async function apiGetAuditorLoanPerformance(
  token: string
): Promise<ApiAuditorLoanPerformance | null> {
  return wrapWithPerf('apiGetAuditorLoanPerformance', async () => {
    return (await api.get<ApiAuditorLoanPerformance>(config.staff.auditorLoanPerformance, token)) ?? null;
  });
}

export async function apiGetAuditorAging(token: string): Promise<ApiAuditorAging | null> {
  return wrapWithPerf('apiGetAuditorAging', async () => {
    return (await api.get<ApiAuditorAging>(config.staff.auditorAging, token)) ?? null;
  });
}

export async function apiGetAuditorRiskAging(token: string): Promise<unknown> {
  return api.get(config.staff.auditorRiskAging, token);
}

export async function apiGetAuditorLiquidity(token: string): Promise<Record<string, unknown> | null> {
  return (await api.get<Record<string, unknown>>(config.staff.auditorRiskLiquidity, token)) ?? null;
}

export async function apiGetAuditorNdti(token: string): Promise<Record<string, unknown> | null> {
  return (await api.get<Record<string, unknown>>(config.staff.auditorRiskNdti, token)) ?? null;
}

export async function apiGetAuditorCrb(token: string): Promise<Record<string, unknown> | null> {
  return (await api.get<Record<string, unknown>>(config.staff.auditorRiskCrb, token)) ?? null;
}

export async function apiGetAuditorFia(token: string): Promise<Record<string, unknown> | null> {
  return (await api.get<Record<string, unknown>>(config.staff.auditorRiskFia, token)) ?? null;
}

export async function apiGetAuditorFindings(
  token: string,
  opts?: { status?: string; severity?: string; limit?: number }
): Promise<ApiAuditorFindingPage> {
  const q = new URLSearchParams();
  if (opts?.status) q.set('status', opts.status);
  if (opts?.severity) q.set('severity', opts.severity);
  q.set('limit', String(opts?.limit ?? 40));
  const res = await api.get<ApiAuditorFindingPage>(`${config.staff.auditorFindings}?${q}`, token);
  return { items: res?.items ?? [], total: res?.total ?? 0, page: res?.page ?? 1, limit: res?.limit ?? 40 };
}

export async function apiCreateAuditorFinding(
  token: string,
  body: {
    title: string;
    description?: string;
    severity?: string;
    category?: string;
    source_reference?: string;
  }
): Promise<ApiAuditorFinding> {
  return api.post<ApiAuditorFinding>(config.staff.auditorFindings, body, token);
}

export async function apiUpdateAuditorFinding(
  token: string,
  findingId: number,
  body: { status?: string; resolution_notes?: string }
): Promise<ApiAuditorFinding> {
  return api.put<ApiAuditorFinding>(config.staff.auditorFinding(findingId), body, token);
}

export async function apiGetAuditorTrail(
  token: string,
  opts?: { days?: number; category?: string; limit?: number }
): Promise<ApiAuditorTrailPage> {
  const q = new URLSearchParams();
  q.set('days', String(opts?.days ?? 7));
  q.set('limit', String(opts?.limit ?? 40));
  if (opts?.category) q.set('category', opts.category);
  const res = await api.get<ApiAuditorTrailPage>(`${config.staff.auditorTrail}?${q}`, token);
  return { items: res?.items ?? [], total: res?.total ?? 0, page: res?.page ?? 1, limit: res?.limit ?? 40 };
}

export async function apiGetAuditorStatistics(token: string): Promise<ApiAuditorStatistics | null> {
  return (await api.get<ApiAuditorStatistics>(config.staff.auditorStatistics, token)) ?? null;
}

export async function apiGetAuditorClients(
  token: string,
  opts?: { search?: string; limit?: number }
): Promise<ApiAuditorClientPage> {
  const q = new URLSearchParams();
  q.set('limit', String(opts?.limit ?? 30));
  if (opts?.search) q.set('search', opts.search);
  const res = await api.get<ApiAuditorClientPage>(`${config.staff.auditorClients}?${q}`, token);
  return { items: res?.items ?? [], total: res?.total ?? 0 };
}
