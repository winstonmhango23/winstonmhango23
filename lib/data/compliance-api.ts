import { api } from '@/lib/api-client';
import { config } from '@/lib/config';

export type ApiComplianceCase = {
  id: number;
  client_id: number;
  client_name?: string;
  case_type: string;
  status: string;
  priority: string;
  description?: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at?: string;
};

export type ApiComplianceCheckResult = {
  id: number;
  client_id: number;
  check_type: string;
  result: string;
  details?: string;
  checked_by_name?: string;
  checked_at: string;
};

export async function apiGetComplianceCases(token: string): Promise<ApiComplianceCase[]> {
  const res = await api.get<ApiComplianceCase[]>(`${config.apiBase}/compliance/cases`, token);
  return res ?? [];
}

export async function apiCreateComplianceCase(
  token: string,
  data: { client_id: number; case_type: string; priority: string; description?: string }
): Promise<ApiComplianceCase | null> {
  return api.post<ApiComplianceCase>(`${config.apiBase}/compliance/cases`, data, token);
}

export async function apiUpdateComplianceCaseStatus(
  token: string,
  caseId: number,
  status: string
): Promise<ApiComplianceCase | null> {
  return api.patch<ApiComplianceCase>(`${config.apiBase}/compliance/cases/${caseId}`, { status }, token);
}

export async function apiGetComplianceChecks(token: string): Promise<ApiComplianceCheckResult[]> {
  const res = await api.get<ApiComplianceCheckResult[]>(`${config.apiBase}/compliance/checks`, token);
  return res ?? [];
}

export async function apiRunComplianceCheck(
  token: string,
  clientId: number,
  checkType: string
): Promise<ApiComplianceCheckResult | null> {
  return api.post<ApiComplianceCheckResult>(`${config.apiBase}/compliance/checks`, { client_id: clientId, check_type: checkType }, token);
}

export async function apiGetComplianceStats(token: string): Promise<{
  total_cases: number;
  open_cases: number;
  cleared_cases: number;
  pending_review: number;
  aml_alerts: number;
} | null> {
  const res = await api.get<{ total_cases: number; open_cases: number; cleared_cases: number; pending_review: number; aml_alerts: number }>(
    `${config.apiBase}/compliance/stats`, token
  );
  return res ?? null;
}
