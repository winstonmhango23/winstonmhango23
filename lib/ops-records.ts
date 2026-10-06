import type { Href } from 'expo-router';

import {
  isAccountantStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
} from '@/lib/loan-origination/origination-workflow';

export type OpsRepaymentRole = 'officer' | 'assistant' | 'manager';

export type OpsRepaymentRecord = {
  id: number;
  loan_id: number;
  client_id: number;
  repayment_date: string | null;
  principal_amount_minor: number;
  interest_amount_minor: number;
  penalty_amount_minor: number;
  overpayment_amount_minor: number;
  installment_due_amount_minor: number;
  total_amount_minor: number;
  outstanding_principal_after_minor: number;
  outstanding_interest_after_minor: number;
  payment_method: string | null;
  payment_source: string | null;
  reference_number: string | null;
  physical_receipt_number: string | null;
  receipt_number: string | null;
  receipt_issued_at: string | null;
  allocation_preference: string | null;
  internal_status: string;
  lifecycle_state: string | null;
  created_at: string | null;
  escalation: {
    escalated_to_manager: boolean;
    reason: string | null;
    escalated_by_name: string | null;
    escalated_at: string | null;
    manager_approval_status: string;
    manager_approved_by_name: string | null;
    manager_approved_at: string | null;
    manager_rejection_reason: string | null;
  };
  received_by_name: string | null;
  client: {
    id: number;
    client_number?: string | null;
    name: string;
    phone_number?: string | null;
    email?: string | null;
    client_type?: string | null;
  };
  loan: {
    id: number;
    loan_account_number: string;
    status: string | null;
    principal_amount_minor: number;
    outstanding_principal_minor: number;
    outstanding_interest_minor: number;
    days_in_arrears: number;
    next_due_date: string | null;
    product_name: string | null;
    branch_name: string | null;
    loan_officer_name: string | null;
  };
  member_contributions: Array<{
    member_client_id: number;
    member_name?: string | null;
    amount_minor: number;
  }>;
  selected_installments: Array<{
    id: number;
    installment_number: number;
    due_date: string | null;
    total_amount_minor: number;
    paid_amount_minor: number;
    status: string | null;
  }>;
  lifecycle_events: Array<{
    id: number;
    from_state: string | null;
    to_state: string;
    event_type: string;
    triggered_by: string | null;
    triggered_by_staff_name: string | null;
    notes: string | null;
    created_at: string | null;
  }>;
  actions: {
    can_escalate: boolean;
    can_approve_escalation: boolean;
    can_approve_pending?: boolean;
    can_confirm: boolean;
  };
};

export type OpsQueueDisbursement = {
  id: number;
  disbursement_number: string;
  amount_minor: number;
  disbursement_date: string | null;
  method: string | null;
  status: string | null;
  reference_number: string | null;
  notes: string | null;
  disbursed_by_name: string | null;
};

export type OpsOriginationQueueRecord = {
  application: {
    id: number;
    application_number: string;
    client_id: number;
    requested_amount?: number;
    approved_amount?: number | null;
    requested_term_months?: number;
    approved_term_months?: number | null;
    interest_rate?: number | null;
    purpose?: string | null;
    application_notes?: string | null;
    disbursement_date?: string | null;
    origination_stage?: string | null;
    has_collateral?: boolean;
    has_guarantor?: boolean;
    client_name?: string | null;
    product_name?: string | null;
  };
  stage: string | null;
  in_ops_queue: boolean;
  client: {
    id: number;
    client_number?: string | null;
    name: string;
    phone_number?: string | null;
    email?: string | null;
    client_type?: string | null;
  };
  product: {
    name?: string | null;
    interest_rate_bps?: number | null;
    repayment_frequency?: string | null;
    grace_period_days?: number | null;
    term_months?: number | null;
  };
  branch: { id?: number | null; name?: string | null };
  loan: {
    id: number;
    loan_account_number: string;
    status: string | null;
    principal_amount_minor: number;
    outstanding_principal_minor: number;
    outstanding_interest_minor: number;
    first_disbursement_date: string | null;
    next_due_date: string | null;
    days_in_arrears: number;
    loan_officer_name: string | null;
  } | null;
  disbursements: OpsQueueDisbursement[];
  posted_disbursed_amount_minor: number;
  schedule: {
    has_repayment_schedule: boolean;
    installment_count: number;
    next_due_date: string | null;
    next_due_amount_minor: number | null;
    installments: Array<{
      id: number;
      installment_number: number;
      due_date: string | null;
      total_amount_minor: number;
      paid_amount_minor: number;
      status: string | null;
    }>;
  };
  readiness: {
    is_ready?: boolean;
    kyc_status?: string;
    collateral_status?: string;
    guarantor_status?: string;
    issues?: string[];
    ready_for_disbursement?: boolean;
  };
  loan_officer_name?: string | null;
  purpose?: string | null;
  application_notes?: string | null;
  actions: {
    can_submit_to_manager: boolean;
    can_repair_schedule: boolean;
  };
};

export function labelOpsEnum(value?: string | null): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

export function opsRepaymentRoleFromBackend(role?: string | null): OpsRepaymentRole | null {
  if (isOperationsManagerStaffRole(role)) return 'manager';
  if (isOperationsAssistantStaffRole(role)) return 'assistant';
  if (isOperationsOfficerStaffRole(role)) return 'officer';
  if (isAccountantStaffRole(role)) return 'officer';
  return null;
}

export function opsRepaymentRecordHref(repaymentId: number, role?: OpsRepaymentRole | null): Href {
  if (role === 'manager') {
    return `/(staff)/operations-manager/repayment/${repaymentId}` as Href;
  }
  return `/(staff)/operations/repayment/${repaymentId}` as Href;
}

export function opsQueueDetailHref(applicationId: number, useManagerApi = false): Href {
  if (useManagerApi) {
    return `/(staff)/operations-manager/queue/${applicationId}` as Href;
  }
  return `/(staff)/operations/queue/${applicationId}` as Href;
}
