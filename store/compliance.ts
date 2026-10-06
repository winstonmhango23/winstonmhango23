import { create } from 'zustand';
import { getStoredAuth } from '@/lib/storage';
import * as complianceApi from '@/lib/data/compliance-api';

interface ComplianceState {
  cases: complianceApi.ApiComplianceCase[];
  checks: complianceApi.ApiComplianceCheckResult[];
  stats: {
    total_cases: number;
    open_cases: number;
    cleared_cases: number;
    pending_review: number;
    aml_alerts: number;
  } | null;
  loading: boolean;
  fetchCases: () => Promise<void>;
  fetchChecks: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createCase: (data: { client_id: number; case_type: string; priority: string; description?: string }) => Promise<complianceApi.ApiComplianceCase | null>;
  updateCaseStatus: (caseId: number, status: string) => Promise<complianceApi.ApiComplianceCase | null>;
  runCheck: (clientId: number, checkType: string) => Promise<complianceApi.ApiComplianceCheckResult | null>;
}

export const useComplianceStore = create<ComplianceState>((set) => ({
  cases: [],
  checks: [],
  stats: null,
  loading: false,

  fetchCases: async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const cases = await complianceApi.apiGetComplianceCases(auth.token);
      set({ cases });
    } catch { /* silent */ }
  },

  fetchChecks: async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const checks = await complianceApi.apiGetComplianceChecks(auth.token);
      set({ checks });
    } catch { /* silent */ }
  },

  fetchStats: async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const stats = await complianceApi.apiGetComplianceStats(auth.token);
      set({ stats });
    } catch { /* silent */ }
  },

  createCase: async (data) => {
    const auth = await getStoredAuth();
    if (!auth?.token) return null;
    const result = await complianceApi.apiCreateComplianceCase(auth.token, data);
    if (result) set((s) => ({ cases: [result, ...s.cases] }));
    return result;
  },

  updateCaseStatus: async (caseId, status) => {
    const auth = await getStoredAuth();
    if (!auth?.token) return null;
    const result = await complianceApi.apiUpdateComplianceCaseStatus(auth.token, caseId, status);
    if (result) set((s) => ({ cases: s.cases.map((c) => (c.id === caseId ? result : c)) }));
    return result;
  },

  runCheck: async (clientId, checkType) => {
    const auth = await getStoredAuth();
    if (!auth?.token) return null;
    const result = await complianceApi.apiRunComplianceCheck(auth.token, clientId, checkType);
    if (result) set((s) => ({ checks: [result, ...s.checks] }));
    return result;
  },
}));
