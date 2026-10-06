/**
 * Loan applications store.
 * Uses API when USE_API; SQLite when EXPO_PUBLIC_USE_API=false.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth';
import type { LoanApplication } from './test-data';
import * as data from '@/lib/data';
import type { LoanOriginationTransitionBody } from '@/lib/data/api';

export interface PickedDocument {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  docType: string;
}

export interface SubmitApplicationInput {
  product_name: string;
  requested_amount: number;
  requested_term_months: number;
  purpose?: string;
  documents?: PickedDocument[];
  client_name?: string;
  business_location?: import('@/lib/data/geolocation-types').GeolocationInput;
  group_loan_allocation?: Record<string, unknown>;
  loan_type?: string;
  application_notes?: string;
  /** Direct product id when using mobile loan-applications API */
  loan_product_id?: number;
  selected_repayment_strategy?: string;
  /** Dynamic form values serialized for application_notes */
  dynamic_form_values?: Record<string, string | number>;
  form_type?: string;
  group_member_client_ids?: number[];
  group_parent_client_id?: number;
  declare_mutual_guarantee_pathway?: boolean;
}

interface ApplicationsState {
  applications: LoanApplication[];
  loading: boolean;
  submitting: boolean;
  branches: import('@/lib/data/api').ApiBranch[];
  fetchApplications: (opts?: { clientId?: string; clientName?: string; regionId?: number; supervisedOnly?: boolean; creditBook?: string; isAgricultural?: boolean }) => Promise<void>;
  fetchBranches: () => Promise<void>;
  submitApplication: (input: SubmitApplicationInput) => Promise<LoanApplication | null>;
  submitApplicationForClient: (clientId: string, clientName: string, input: SubmitApplicationInput) => Promise<LoanApplication | null>;
  getApplication: (id: number) => Promise<LoanApplication | null>;
  approveApplication: (id: number, approvedAmount?: number, approvedTermMonths?: number) => Promise<boolean>;
  rejectApplication: (id: number, reason?: string) => Promise<boolean>;
  disburseApplication: (id: number) => Promise<boolean>;
  submitForApproval: (id: number) => Promise<boolean>;
  updateDraftApplication: (
    id: number,
    edits: { requested_amount?: number; requested_term_months?: number; purpose?: string }
  ) => Promise<LoanApplication | null>;
  deleteDraftApplication: (id: number, opts?: { status?: string | null }) => Promise<void>;
  originationTransition: (
    id: number,
    body: LoanOriginationTransitionBody
  ) => Promise<LoanApplication | null>;
}

function generateApplicationNumber(): string {
  const n = Math.floor(Math.random() * 9999) + 1;
  const y = new Date().getFullYear();
  return `APP-${y}-${String(n).padStart(4, '0')}`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rowToApp(row: data.LoanApplicationRow): LoanApplication {
  return {
    id: row.id,
    application_number: row.application_number,
    status: row.status,
    requested_amount: row.requested_amount,
    approved_amount: row.approved_amount,
    requested_term_months: row.requested_term_months,
    product_name: row.product_name,
    loan_product_id: row.loan_product_id,
    application_date: row.application_date,
    client_id: row.client_id,
    client_name: row.client_name,
    purpose: row.purpose,
    assigned_staff_name: row.assigned_staff_name,
    assigned_cio_id: row.assigned_cio_id ?? null,
    assigned_cio_name: row.assigned_cio_name ?? null,
    sync_status: row.sync_status ?? 'pending',
    group_loan_allocation: row.group_loan_allocation,
    origination_stage: row.origination_stage ?? null,
    origination_return_reason: row.origination_return_reason ?? null,
    is_group_application: row.is_group_application,
    my_share_requested_amount_minor: row.my_share_requested_amount_minor ?? null,
    group_requested_amount_minor: row.group_requested_amount_minor ?? null,
  };
}

export const useApplicationsStore = create<ApplicationsState>((set) => ({
  applications: [],
  loading: false,
  submitting: false,
  branches: [],

  fetchApplications: async (opts) => {
    set({ loading: true });
    try {
      const rows = await data.getApplications(
        opts?.clientId, 
        opts?.clientName, 
        opts?.regionId, // In mobile data layer we use branch_id which maps to regionId toggle
        undefined, // officerId not yet used in mobile but could be
        opts?.supervisedOnly,
        opts?.creditBook,
        opts?.isAgricultural
      );
      let apps = rows.map(rowToApp);
      set({ applications: apps, loading: false });
    } catch {
      set({ applications: [], loading: false });
    }
  },

  fetchBranches: async () => {
    try {
      const branches = await data.getBranches();
      set({ branches });
    } catch {
      set({ branches: [] });
    }
  },

  submitApplication: async (input) => {
    set({ submitting: true });
    const user = useAuthStore.getState().user;
    try {
      const row = await data.createApplication({
        application_number: generateApplicationNumber(),
        status: 'DRAFT',
        requested_amount: input.requested_amount,
        requested_term_months: input.requested_term_months,
        product_name: input.product_name,
        application_date: formatDate(new Date()),
        client_name: input.client_name ?? user?.fullName,
        purpose: input.purpose,
        documents_json: input.documents ? JSON.stringify(input.documents) : undefined,
        business_location: input.business_location,
        group_loan_allocation: input.group_loan_allocation,
        loan_type: input.loan_type,
        application_notes: input.application_notes,
        loan_product_id: input.loan_product_id,
        selected_repayment_strategy: input.selected_repayment_strategy,
        group_parent_client_id: input.group_parent_client_id,
        declare_mutual_guarantee_pathway: input.declare_mutual_guarantee_pathway,
      });
      const newApp = rowToApp(row);
      set((s) => ({ applications: [newApp, ...s.applications], submitting: false }));
      return newApp;
    } catch (error) {
      set({ submitting: false });
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  submitApplicationForClient: async (clientId, clientName, input) => {
    set({ submitting: true });
    try {
      const row = await data.createApplication({
        application_number: generateApplicationNumber(),
        status: 'DRAFT',
        requested_amount: input.requested_amount,
        requested_term_months: input.requested_term_months,
        product_name: input.product_name,
        application_date: formatDate(new Date()),
        client_id: clientId,
        client_name: clientName,
        purpose: input.purpose,
        documents_json: input.documents ? JSON.stringify(input.documents) : undefined,
        business_location: input.business_location,
        group_loan_allocation: input.group_loan_allocation,
        loan_type: input.loan_type,
        application_notes: input.application_notes,
        loan_product_id: input.loan_product_id,
        selected_repayment_strategy: input.selected_repayment_strategy,
        group_parent_client_id: input.group_parent_client_id,
        declare_mutual_guarantee_pathway: input.declare_mutual_guarantee_pathway,
      });
      const newApp = rowToApp(row);
      set((s) => ({ applications: [newApp, ...s.applications], submitting: false }));
      return newApp;
    } catch (error) {
      set({ submitting: false });
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  getApplication: async (id) => {
    try {
      const row = await data.getApplication(id);
      return row ? rowToApp(row) : null;
    } catch {
      return null;
    }
  },

  approveApplication: async (id, approvedAmount, approvedTermMonths) => {
    try {
      await data.updateApplication(id, {
        status: 'APPROVED',
        approved_amount: approvedAmount,
        approved_term_months: approvedTermMonths,
      });
      set((s) => ({
        applications: s.applications.map((a) =>
          a.id === id
            ? { ...a, status: 'APPROVED', approved_amount: approvedAmount ?? a.requested_amount, approved_term_months: approvedTermMonths ?? a.requested_term_months }
            : a
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  rejectApplication: async (id, reason) => {
    try {
      await data.updateApplication(id, { status: 'REJECTED', rejection_reason: reason });
      set((s) => ({
        applications: s.applications.map((a) => (a.id === id ? { ...a, status: 'REJECTED' } : a)),
      }));
      return true;
    } catch {
      return false;
    }
  },

  submitForApproval: async (id) => {
    try {
      const row = await data.submitApplicationForApproval(id);
      const updated = rowToApp(row);
      set((s) => ({
        applications: s.applications.map((a) => (a.id === id ? { ...a, ...updated } : a)),
      }));
      return true;
    } catch {
      return false;
    }
  },

  updateDraftApplication: async (id, edits) => {
    try {
      const row = await data.updateDraftApplication(id, edits);
      const updated = rowToApp(row);
      set((s) => ({
        applications: s.applications.map((a) => (a.id === id ? { ...a, ...updated } : a)),
      }));
      return updated;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  deleteDraftApplication: async (id, opts) => {
    const existing = useApplicationsStore.getState().applications.find(
      (a) => a.id === id || a.remote_id === id
    );
    const status = opts?.status ?? existing?.status;
    await data.deleteDraftApplication(id, { status });
    const remoteId = existing?.remote_id ?? null;
    set((s) => ({
      applications: s.applications.filter(
        (a) =>
          a.id !== id &&
          a.remote_id !== id &&
          !(remoteId != null && (a.id === remoteId || a.remote_id === remoteId))
      ),
    }));
  },

  disburseApplication: async (_id) => {
    // Disbursement is Accountant → Ops Assistant review → CEO release on web BMS.
    // Do not pretend a local status patch completes the money path.
    return false;
  },

  originationTransition: async (id, body) => {
    const row = await data.postOriginationTransition(id, body);
    const updated = rowToApp(row);
    set((s) => ({
      applications: s.applications.map((a) => (a.id === id ? { ...a, ...updated } : a)),
    }));
    return updated;
  },
}));
