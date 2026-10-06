import { api } from '@/lib/api-client';
import { config } from '@/lib/config';
import { apiGetOverdue, type ApiRepaymentOverviewItem } from '@/lib/data/api';

const BASE = `${config.apiBase}`;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DelinquentLoan {
  loan_id: number;
  loan_account_number: string;
  client_id: number;
  client_name: string;
  product_name?: string;
  outstanding_principal: number;
  overdue_amount: number;
  days_in_arrears: number;
  next_due_date?: string;
  assigned_officer_name?: string;
  branch_name?: string;
}

export interface CollectionCase {
  id: number;
  case_number?: string;
  client_id?: number;
  client_name: string;
  loan_id: number;
  loan_account_number: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'URGENT';
  assigned_to_name?: string;
  assigned_collector_id?: number | null;
  outstanding_amount: number;
  days_in_arrears: number;
  opened_at: string;
  last_activity_at?: string;
  notes?: string;
  resolved_by_repayment_id?: number | null;
}

export interface CollectionActivity {
  id: number;
  case_id: number;
  activity_type: string;
  description: string;
  performed_by_name: string;
  created_at: string;
}

export interface CollectionStats {
  total_cases: number;
  open_cases: number;
  in_progress_cases: number;
  resolved_cases: number;
  critical_cases: number;
  total_overdue: number;
  total_recovered: number;
}

export interface DelinquencyBucket {
  range: string;
  count: number;
  amount: number;
  percentage: number;
}

type BackendCase = {
  id: number;
  case_number?: string;
  loan_id: number;
  case_status?: string;
  priority_level?: string;
  assigned_collector_id?: number | null;
  delinquency_days?: number | null;
  total_overdue_amount?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string | null;
  resolved_by_repayment_id?: number | null;
  client_id?: number;
  client_name?: string;
  loan_account_number?: string;
  assigned_to_name?: string;
};

type BackendActivity = {
  id: number;
  collection_case_id?: number;
  case_id?: number;
  activity_type?: string;
  notes?: string | null;
  outcome?: string | null;
  created_by?: number;
  created_by_name?: string;
  performed_by_name?: string;
  activity_date?: string | null;
  created_at?: string;
};

function mapCase(raw: BackendCase): CollectionCase {
  const priorityRaw = (raw.priority_level ?? 'MEDIUM').toUpperCase();
  const priority =
    priorityRaw === 'URGENT' || priorityRaw === 'CRITICAL'
      ? (priorityRaw as CollectionCase['priority'])
      : (priorityRaw as CollectionCase['priority']);
  const status = (raw.case_status ?? 'OPEN').toUpperCase() as CollectionCase['status'];
  return {
    id: raw.id,
    case_number: raw.case_number,
    client_id: raw.client_id,
    client_name: raw.client_name ?? (raw.case_number ? `Case ${raw.case_number}` : `Case #${raw.id}`),
    loan_id: raw.loan_id,
    loan_account_number: raw.loan_account_number ?? `Loan #${raw.loan_id}`,
    status,
    priority,
    assigned_to_name: raw.assigned_to_name,
    assigned_collector_id: raw.assigned_collector_id,
    outstanding_amount: Number(raw.total_overdue_amount ?? 0),
    days_in_arrears: Number(raw.delinquency_days ?? 0),
    opened_at: raw.created_at ?? new Date().toISOString(),
    last_activity_at: raw.updated_at ?? undefined,
    notes: raw.notes ?? undefined,
    resolved_by_repayment_id: raw.resolved_by_repayment_id,
  };
}

function mapActivity(raw: BackendActivity): CollectionActivity {
  return {
    id: raw.id,
    case_id: Number(raw.collection_case_id ?? raw.case_id ?? 0),
    activity_type: raw.activity_type ?? 'CALL',
    description: raw.notes ?? raw.outcome ?? '',
    performed_by_name: raw.performed_by_name ?? raw.created_by_name ?? 'Staff',
    created_at: raw.activity_date ?? raw.created_at ?? new Date().toISOString(),
  };
}

function overviewToDelinquent(item: ApiRepaymentOverviewItem): DelinquentLoan {
  const nextDue =
    typeof item.next_due_date === 'string' ? item.next_due_date.slice(0, 10) : undefined;
  return {
    loan_id: item.id,
    loan_account_number: item.loan_account_number,
    client_id: item.client_id,
    client_name: item.client_name ?? 'Client',
    product_name: item.product_name,
    outstanding_principal: item.outstanding_principal ?? 0,
    overdue_amount: item.next_due_amount ?? item.outstanding_principal ?? 0,
    days_in_arrears: item.days_in_arrears ?? Math.abs(item.days_until_due ?? 0),
    next_due_date: nextDue,
  };
}

// ─── API Wrappers ──────────────────────────────────────────────────────────

/** Delinquent loans for LO field work — from repayment overdue hub (not /collections/delinquency). */
export async function apiGetDelinquentLoans(token: string): Promise<DelinquentLoan[]> {
  const items = await apiGetOverdue(token);
  return items.map(overviewToDelinquent);
}

export async function apiGetDelinquencyBuckets(
  token: string
): Promise<{ buckets: DelinquencyBucket[]; total_overdue_amount: number }> {
  const res = await api.get<{ buckets?: DelinquencyBucket[]; total_overdue_amount?: number }>(
    `${BASE}/collections/delinquency-buckets`,
    token
  );
  return {
    buckets: res?.buckets ?? [],
    total_overdue_amount: Number(res?.total_overdue_amount ?? 0),
  };
}

export async function apiGetCollectionCases(token: string, status?: string): Promise<CollectionCase[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (status) params.set('case_status', status);
  const res = await api.get<{ items?: BackendCase[] } | BackendCase[]>(
    `${BASE}/collections/cases?${params.toString()}`,
    token
  );
  const items = Array.isArray(res) ? res : res?.items ?? [];
  return items.map(mapCase);
}

export async function apiGetCollectionCase(token: string, caseId: number): Promise<CollectionCase | null> {
  const res = await api.get<BackendCase>(`${BASE}/collections/cases/${caseId}`, token);
  return res ? mapCase(res) : null;
}

export async function apiGetCollectionActivities(
  token: string,
  caseId: number
): Promise<CollectionActivity[]> {
  const res = await api.get<BackendActivity[]>(`${BASE}/collections/case/${caseId}/activities`, token);
  return (res ?? []).map(mapActivity);
}

export async function apiGetCollectionStats(token: string): Promise<CollectionStats | null> {
  const res = await api.get<{
    total_collection_cases?: number;
    open_cases?: number;
    total_delinquent_accounts?: number;
    accounts_overdue_30_plus_days?: number;
    total_recovered_30d?: number;
  }>(`${BASE}/collections/dashboard/summary`, token);
  if (!res) return null;
  return {
    total_cases: Number(res.total_collection_cases ?? 0),
    open_cases: Number(res.open_cases ?? 0),
    in_progress_cases: 0,
    resolved_cases: 0,
    critical_cases: Number(res.accounts_overdue_30_plus_days ?? 0),
    total_overdue: Number(res.total_delinquent_accounts ?? 0),
    total_recovered: Number(res.total_recovered_30d ?? 0),
  };
}

export async function apiCreateCollectionCase(
  token: string,
  data: { loan_id: number; client_id?: number; priority?: string; notes?: string }
): Promise<CollectionCase | null> {
  const body = {
    loan_id: data.loan_id,
    priority_level: data.priority ?? 'MEDIUM',
    notes: data.notes,
  };
  const res = await api.post<BackendCase>(`${BASE}/collections/cases`, body, token);
  return res ? mapCase(res) : null;
}

export async function apiCreateCollectionActivity(
  token: string,
  caseId: number,
  data: { activity_type: string; description: string; created_by: number }
): Promise<CollectionActivity | null> {
  // Backend ActivityType: CALL | EMAIL | SMS | LETTER | VISIT | MEETING
  const allowed = new Set(['CALL', 'EMAIL', 'SMS', 'LETTER', 'VISIT', 'MEETING']);
  let activityType = data.activity_type.toUpperCase();
  let outcome: string | undefined;
  if (activityType === 'NOTE') activityType = 'CALL';
  if (activityType === 'PAYMENT_PROMISE') {
    activityType = 'CALL';
    outcome = 'PROMISE_TO_PAY';
  }
  if (activityType === 'PARTIAL_PAYMENT') {
    activityType = 'CALL';
    outcome = 'PARTIAL_PAYMENT';
  }
  if (!allowed.has(activityType)) activityType = 'CALL';

  const body = {
    collection_case_id: caseId,
    activity_type: activityType,
    notes: data.description,
    outcome,
    created_by: data.created_by,
  };
  const res = await api.post<BackendActivity>(`${BASE}/collections/activities`, body, token);
  return res ? mapActivity(res) : null;
}

export async function apiResolveCollectionCase(
  token: string,
  caseId: number,
  data: { resolution_outcome: string; notes?: string; settlement_amount?: number }
): Promise<CollectionCase | null> {
  const res = await api.post<BackendCase>(`${BASE}/collections/cases/${caseId}/resolve`, data, token);
  return res ? mapCase(res) : null;
}

export async function apiAssignCollectionCase(
  token: string,
  caseId: number,
  collectorId: number
): Promise<CollectionCase | null> {
  const res = await api.post<BackendCase>(
    `${BASE}/collections/cases/${caseId}/assign`,
    { collector_id: collectorId },
    token
  );
  return res ? mapCase(res) : null;
}
