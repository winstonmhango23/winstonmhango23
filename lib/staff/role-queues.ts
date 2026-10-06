import type { Href } from 'expo-router';

import {
  isAccountantStaffRole,
  isCeoStaffRole,
  isGceoStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
} from '@/lib/loan-origination/origination-workflow';

export type StaffAppQueue =
  | 'all'
  | 'pending'
  | 'collateral'
  | 'review'
  | 'pm'
  | 'ready'
  | 'ops'
  | 'handoff'
  | 'ceo'
  | 'gceo'
  | 'returned';

const PM_QUEUE_STAGES = new Set(['CIO_VERIFIED_TO_PM']);
const CIO_REVIEW_STAGES = new Set(['SUBMITTED_TO_CIO']);
const CIO_LEFT_REVIEW_STAGES = new Set([
  'CIO_VERIFIED_TO_PM',
  'SUBMITTED_TO_CEO',
  'SUBMITTED_TO_GCEO',
  'PENDING_DISBURSEMENT',
]);

const ACCOUNTANT_QUEUE_STATUSES = new Set([
  'APPROVED',
  'PENDING_DISBURSEMENT',
  'READY_FOR_ACCOUNTANT',
  'READY_FOR_DISBURSEMENT',
  'AWAITING_DISBURSEMENT',
]);

const ACCOUNTANT_QUEUE_STAGES = new Set([
  'PENDING_DISBURSEMENT',
  'READY_FOR_ACCOUNTANT',
  'AWAITING_DISBURSEMENT',
]);

const OPS_OFFICER_STAGES = new Set(['DISBURSED_OPS_QUEUE', 'OPS_PENDING_OFFICER']);
const OPS_HANDOFF_STAGES = new Set(['OPS_PENDING_MANAGER']);
const CEO_QUEUE_STAGES = new Set(['SUBMITTED_TO_CEO', 'WITH_CEO', 'PENDING_CEO_REVIEW']);
const GCEO_QUEUE_STAGES = new Set(['SUBMITTED_TO_GCEO', 'WITH_GCEO', 'PENDING_GCEO_REVIEW']);

export function staffApplicationWorkspaceHref(id: number): Href {
  return `/(staff)/applications/${id}` as Href;
}

export { staffDrawdownEditorHref } from '@/lib/staff/loan-drawdown';

export function normalizeStaffAppQueue(raw: string | string[] | undefined): StaffAppQueue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === 'pending' ||
    value === 'collateral' ||
    value === 'review' ||
    value === 'pm' ||
    value === 'ready' ||
    value === 'ops' ||
    value === 'handoff' ||
    value === 'ceo' ||
    value === 'gceo' ||
    value === 'returned'
  ) {
    return value;
  }
  return 'all';
}

/**
 * Files sent back to the loan officer lane (CEO/CIO rework / client updates).
 * A terminal status wins, so an ended application never appears in the returned
 * queue even if the stage string still reads `RETURNED_TO_LO`.
 */
export function applicationMatchesReturnedQueue(app: {
  status?: string | null;
  origination_stage?: string | null;
  origination_return_reason?: string | null;
}): boolean {
  const status = String(app.status ?? '').toUpperCase();
  if (['REJECTED', 'WITHDRAWN', 'DISBURSED'].includes(status)) return false;
  const stage = String(app.origination_stage ?? '').toUpperCase();
  if (stage === 'RETURNED_TO_LO') return true;
  return Boolean(app.origination_return_reason && (app.origination_return_reason ?? '').trim().length > 0);
}

export function applicationMatchesPmQueue(app: {
  status?: string | null;
  origination_stage?: string | null;
}): boolean {
  const status = String(app.status ?? '').toUpperCase();
  const stage = String(app.origination_stage ?? '').toUpperCase();
  return PM_QUEUE_STAGES.has(stage) || status === 'UNDER_REVIEW' && stage.includes('PM');
}

export function applicationMatchesCioReviewQueue(app: {
  status?: string | null;
  origination_stage?: string | null;
}): boolean {
  const status = String(app.status ?? '').toUpperCase();
  const stage = String(app.origination_stage ?? '').toUpperCase();
  if (CIO_LEFT_REVIEW_STAGES.has(stage)) return false;
  return (
    CIO_REVIEW_STAGES.has(stage) ||
    status === 'SUBMITTED' ||
    status === 'PENDING_REVIEW'
  );
}

export function applicationMatchesAccountantQueue(app: {
  status?: string | null;
  origination_stage?: string | null;
}): boolean {
  const status = String(app.status ?? '').toUpperCase();
  const stage = String(app.origination_stage ?? '').toUpperCase();
  return ACCOUNTANT_QUEUE_STATUSES.has(status) || ACCOUNTANT_QUEUE_STAGES.has(stage);
}

export function applicationMatchesOpsOfficerQueue(app: {
  status?: string | null;
  origination_stage?: string | null;
}): boolean {
  const stage = String(app.origination_stage ?? '').toUpperCase();
  return OPS_OFFICER_STAGES.has(stage) || stage.includes('DISBURSED_OPS');
}

export function applicationMatchesOpsHandoffQueue(app: {
  origination_stage?: string | null;
}): boolean {
  const stage = String(app.origination_stage ?? '').toUpperCase();
  return OPS_HANDOFF_STAGES.has(stage);
}

export function applicationMatchesCeoQueue(app: {
  origination_stage?: string | null;
}): boolean {
  const stage = String(app.origination_stage ?? '').toUpperCase();
  if (GCEO_QUEUE_STAGES.has(stage) || stage.includes('GCEO')) return false;
  return CEO_QUEUE_STAGES.has(stage) || stage.includes('CEO');
}

export function applicationMatchesGceoQueue(app: {
  origination_stage?: string | null;
}): boolean {
  const stage = String(app.origination_stage ?? '').toUpperCase();
  return GCEO_QUEUE_STAGES.has(stage) || stage.includes('GCEO');
}

export function applicationsListCopy(role?: string | null): { title: string; subtitle: string } {
  if (isPortfolioManagerStaffRole(role)) {
    return {
      title: 'Approvals',
      subtitle: 'PM/CEO/GCEO files — open a loan for drawdowns, payee details, and escalation',
    };
  }
  if (isAccountantStaffRole(role)) {
    return {
      title: 'Ready to disburse',
      subtitle: 'Executive-approved deals awaiting funding, journals, and operations handoff',
    };
  }
  if (isOperationsManagerStaffRole(role)) {
    return {
      title: 'Operations manager queues',
      subtitle: 'Credit oversight, repayment handoff, and escalated receipts',
    };
  }
  if (isOperationsOfficerStaffRole(role)) {
    return {
      title: 'Operations handoff',
      subtitle: 'Post-disbursement files and repayment receipts awaiting operations',
    };
  }
  if (isGceoStaffRole(role)) {
    return {
      title: 'GCEO action queue',
      subtitle: 'Final-band origination files — open a loan to approve to accountant',
    };
  }
  if (isCeoStaffRole(role)) {
    return {
      title: 'CEO action queue',
      subtitle: 'Limit-gated origination files — approve to accountant or escalate to GCEO',
    };
  }
  return {
    title: 'Applications',
    subtitle: 'Review and process loan applications',
  };
}
