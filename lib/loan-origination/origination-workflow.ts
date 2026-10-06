import type { OriginationStatus } from '@/lib/data/api';

/** Actions a loan officer may invoke on mobile (backend role filter is authoritative; this is UI guard). */
export const LOAN_OFFICER_ORIGINATION_ACTIONS = new Set([
  'SUBMIT_TO_CIO',
  'LO_RETURN_TO_CLIENT',
]);

/** CIO/SCIO actions available on the staff mobile workspace. */
export const CREDIT_OFFICER_ORIGINATION_ACTIONS = new Set([
  'CIO_SUBMIT_TO_PM',
  'CIO_VERIFY_TO_PM',
  'CIO_RETURN_TO_LO',
  'SUBMIT_TO_CIO',
]);

/** Historical desktop-only list. Mobile now runs the same suggested transitions. */
export const STAFF_DESKTOP_ONLY_ACTIONS = new Set([
  'PM_APPROVE_TO_ACCOUNTANT',
  'PM_SUBMIT_TO_CEO',
  'PM_SUBMIT_TO_GCEO',
  'CEO_APPROVE_TO_ACCOUNTANT',
  'CEO_SUBMIT_TO_GCEO',
  'GCEO_APPROVE_TO_ACCOUNTANT',
  'OPS_OFFICER_SUBMIT_TO_MANAGER',
  'OPS_COMPLETE_HANDOFF',
  'OPS_MANAGER_ACKNOWLEDGE',
  'DISBURSE_THEN_POST_DISBURSEMENT_OPS',
]);

/** Portfolio manager escalation actions on the shared application workspace. */
export const PORTFOLIO_MANAGER_ORIGINATION_ACTIONS = new Set([
  'PM_APPROVE_TO_ACCOUNTANT',
  'PM_SUBMIT_TO_CEO',
  'PM_SUBMIT_TO_GCEO',
]);

/** Accountant / funding actions on the shared application workspace. */
export const ACCOUNTANT_ORIGINATION_ACTIONS = new Set([
  'DISBURSE_THEN_POST_DISBURSEMENT_OPS',
  'OPS_MANAGER_SUBMIT_TO_ACCOUNTANT',
]);

/** Operations officer post-disburse handoff on the shared application workspace. */
export const OPERATIONS_OFFICER_ORIGINATION_ACTIONS = new Set([
  'OPS_OFFICER_SUBMIT_TO_MANAGER',
  'OPS_COMPLETE_HANDOFF',
]);

/** Operations manager credit and repayment-handoff actions. */
export const OPERATIONS_MANAGER_ORIGINATION_ACTIONS = new Set([
  'OPS_MANAGER_ACKNOWLEDGE',
  'OPS_MANAGER_SUBMIT_TO_ACCOUNTANT',
]);

/** CEO origination band. */
export const CEO_ORIGINATION_ACTIONS = new Set([
  'CEO_APPROVE_TO_ACCOUNTANT',
  'CEO_SUBMIT_TO_GCEO',
]);

/** GCEO final origination band. */
export const GCEO_ORIGINATION_ACTIONS = new Set(['GCEO_APPROVE_TO_ACCOUNTANT']);

export const LOAN_OFFICER_ACTION_LABELS: Record<string, string> = {
  SUBMIT_TO_CIO: 'Submit to CIO for review',
  CIO_SUBMIT_TO_PM: 'Submit to portfolio manager',
  CIO_VERIFY_TO_PM: 'Verify and submit to portfolio manager',
  CIO_RETURN_TO_LO: 'Return to loan officer',
  LO_RETURN_TO_CLIENT: 'Return to client for updates',
  PM_APPROVE_TO_ACCOUNTANT: 'Approve to accountant',
  PM_SUBMIT_TO_CEO: 'Submit to CEO',
  PM_SUBMIT_TO_GCEO: 'Submit to GCEO',
  CEO_APPROVE_TO_ACCOUNTANT: 'Approve to accountant',
  CEO_SUBMIT_TO_GCEO: 'Escalate to General CEO',
  GCEO_APPROVE_TO_ACCOUNTANT: 'Approve to accountant (final)',
  OPS_MANAGER_SUBMIT_TO_ACCOUNTANT: 'Submit to accountant',
  OPS_OFFICER_SUBMIT_TO_MANAGER: 'Submit to operations manager',
  OPS_COMPLETE_HANDOFF: 'Complete ops handoff',
  OPS_MANAGER_ACKNOWLEDGE: 'Acknowledge for monitoring',
  DISBURSE_THEN_POST_DISBURSEMENT_OPS: 'Book and hand to operations',
};

const DEDICATED_FOOTER_ACTIONS = new Set([
  'SUBMIT_TO_CIO',
  'CIO_SUBMIT_TO_PM',
  'CIO_VERIFY_TO_PM',
  'CIO_RETURN_TO_LO',
  'LO_RETURN_TO_CLIENT',
]);

/** Server-suggested actions not already rendered as dedicated LO/CIO buttons. */
export function filterEscalationActions(actions: string[] | undefined): string[] {
  if (!actions?.length) return [];
  return actions.filter((action) => !DEDICATED_FOOTER_ACTIONS.has(action));
}

export function originationActionLabel(action: string): string {
  return LOAN_OFFICER_ACTION_LABELS[action] || action.replace(/_/g, ' ');
}

export function isCreditOfficerStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  return (
    r === 'CREDIT_INVESTMENT_OFFICER' ||
    r === 'CREDIT_AND_INVESTMENT_OFFICER' ||
    r === 'SENIOR_CREDIT_INVESTMENT_OFFICER' ||
    r === 'CIO' ||
    r === 'SCIO'
  );
}

export type CreditBook = 'SME' | 'GROUP';

const AGRICULTURAL_ALIASES = new Set(['AGRI', 'AGRIC', 'AGRICULTURE', 'AGRICULTURAL']);
const GROUP_STAMPS = new Set(['GROUP', 'VILLAGE', 'COOPERATIVE', 'VILLAGE_BANKING', ...AGRICULTURAL_ALIASES]);
const SME_AGRI_TOKENS = ['IAGSME', 'AGHYB'] as const;
const GROUP_PRODUCT_TOKENS = ['GSMEIN', 'GSMEIR', 'GSMEBL'] as const;
const SME_PRODUCT_TOKENS = ['ISME', 'WSME', 'MSME'] as const;
const AGRI_PRODUCT_TOKENS = ['IAGSME', 'AGHYB', 'GSMEIN', 'GSMEIR', 'GSMEBL'] as const;

export function compactIdentityText(
  ...parts: Array<string | number | null | undefined>
): string {
  return parts
    .map((part) => String(part ?? ''))
    .join(' ')
    .toUpperCase()
    .replace(/[-_\s/.]/g, '');
}

export function isAgriculturalListFilter(value?: string | null): boolean {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return AGRICULTURAL_ALIASES.has(raw);
}

export function normalizeCreditBook(book?: string | null): CreditBook | null {
  const raw = String(book ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if (
    raw === 'SME' ||
    raw === 'BUSINESS' ||
    raw === 'MSME' ||
    raw === 'SB' ||
    raw === 'SALARY' ||
    raw === 'SALARYBACKED'
  ) {
    return 'SME';
  }
  if (GROUP_STAMPS.has(raw) || raw === 'GROUP') return 'GROUP';
  return null;
}

export function isSmeCreditBook(book?: string | null): boolean {
  return normalizeCreditBook(book) === 'SME';
}

export function isGroupCreditBook(book?: string | null): boolean {
  return normalizeCreditBook(book) === 'GROUP';
}

export function creditBookLabel(book?: string | null): string {
  return normalizeCreditBook(book) === 'SME' ? 'SME' : 'Group';
}

export function staffBookOfficerTitle(
  kind: 'cio' | 'lo' | 'pm' | 'accountant' | 'staff',
  book?: string | null
): string {
  const prefix = isSmeCreditBook(book) ? 'SME' : 'Group';
  if (kind === 'cio') return `${prefix} CIO`;
  if (kind === 'lo') return `${prefix} Loan Officer`;
  if (kind === 'pm') return 'Portfolio Manager';
  if (kind === 'accountant') return 'Accountant';
  return 'Staff Digest';
}

export function inferIsAgricultural(
  ...parts: Array<string | number | null | undefined>
): boolean {
  const compact = compactIdentityText(...parts);
  if (!compact) return false;
  if (AGRI_PRODUCT_TOKENS.some((token) => compact.includes(token))) return true;
  return /AGRIC|INPUT|HYBRID/.test(compact);
}

export function inferCreditBookFromIdentity(
  ...parts: Array<string | number | null | undefined>
): CreditBook | null {
  const compact = compactIdentityText(...parts);
  if (!compact) return null;
  if (SME_AGRI_TOKENS.some((token) => compact.includes(token))) return 'SME';
  if (GROUP_PRODUCT_TOKENS.some((token) => compact.includes(token))) return 'GROUP';
  if (compact.includes('GSME')) return 'GROUP';
  if (compact.includes('VILLAGEBANKING') || compact.includes('COOPERATIVE') || compact.includes('GROUP')) {
    return 'GROUP';
  }
  if (SME_PRODUCT_TOKENS.some((token) => compact.includes(token))) return 'SME';
  if (
    compact.includes('SB') ||
    compact.includes('SALARY') ||
    compact.includes('BUSINESS') ||
    compact.includes('SME')
  ) {
    return 'SME';
  }
  if (compact.includes('VILLAGE')) return 'GROUP';
  return null;
}

export function inferCreditBookFromProduct(product: {
  code?: string | null;
  name?: string | null;
  category?: string | null;
  is_agricultural_product?: boolean | null;
  harvest_alignment_config?: { enabled?: boolean } | null;
  product_metadata?: Record<string, unknown> | null;
}): CreditBook | null {
  const meta = product.product_metadata;
  const identity = inferCreditBookFromIdentity(
    product.code,
    product.name,
    product.category,
    meta && typeof meta === 'object' ? String(meta.product_id || '') : '',
    meta && typeof meta === 'object' ? String(meta.target_market || '') : '',
    meta && typeof meta === 'object' ? String(meta.name || '') : ''
  );
  if (identity) return identity;
  if (meta && typeof meta === 'object') {
    const metaId = String(meta.product_id || meta.target_market || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (['GSMEIN', 'GSMEIR', 'GSMEBL', 'GROUP', 'VILLAGE', 'COOPERATIVE'].includes(metaId)) {
      return 'GROUP';
    }
    if (['ISME', 'WSME', 'MSME', 'SME', 'BUSINESS', 'SB', 'SALARY', 'SALARYBACKED'].includes(metaId) || metaId.endsWith('_SME')) {
      return 'SME';
    }
  }
  return null;
}

export type ListingCreditBookRow = {
  application_number?: string | number | null;
  loan_account_number?: string | null;
  id?: string | number | null;
  client_name?: string | null;
  product_name?: string | null;
  loan_type?: string | null;
  is_group_facility?: boolean | null;
  is_group_application?: boolean | null;
};

export function listingRowCreditBook(row: ListingCreditBookRow): CreditBook | null {
  const identity = inferCreditBookFromIdentity(
    row.application_number,
    row.loan_account_number,
    row.id,
    row.client_name,
    row.product_name,
    row.loan_type
  );
  if (identity) return identity;
  const product = inferCreditBookFromProduct({
    name: row.product_name,
    category: row.loan_type,
  });
  if (product) return product;
  if (row.is_group_facility || row.is_group_application) return 'GROUP';
  return null;
}

export function listingRowIsAgricultural(row: ListingCreditBookRow): boolean {
  return inferIsAgricultural(
    row.application_number,
    row.loan_account_number,
    row.id,
    row.product_name,
    row.loan_type
  );
}

export function productMatchesCreditBook(
  product: {
    code?: string | null;
    name?: string | null;
    category?: string | null;
    is_agricultural_product?: boolean | null;
  },
  book?: string | null
): boolean {
  const current = normalizeCreditBook(book);
  const inferred = inferCreditBookFromProduct(product);
  if (!current || !inferred) return true;
  return inferred === current;
}

/**
 * Client-type product eligibility (backend `eligible_client_types` semantics).
 * NULL/empty list → all client types eligible; otherwise the client type must be
 * in the product's allow-list. Mirrors `ProductEligibilityService`.
 */
export function productMatchesClientType(
  product: {
    eligible_client_types?: string[] | null;
  },
  clientType?: string | null
): boolean {
  const allowed = Array.isArray(product?.eligible_client_types)
    ? product.eligible_client_types
        .map((t) => String(t ?? '').toUpperCase().trim())
        .filter(Boolean)
    : [];
  if (allowed.length === 0) return true;
  if (!clientType) return true;
  const normalized = String(clientType).toUpperCase().trim();
  return allowed.includes(normalized);
}

/**
 * Resolve the client-type token used for product-eligibility checks from a raw
 * client row. Group parents/non-individual entities map to GROUP so restriction
 * lists (INDIVIDUAL/GROUP/SME) behave like the backend `_determine_client_type`.
 */
export function resolveClientTypeForEligibility(opts: {
  clientType?: string | null;
  isGroup?: boolean;
}): string | undefined {
  if (opts.isGroup) return 'GROUP';
  const raw = String(opts.clientType ?? '').toUpperCase().trim();
  if (!raw) return undefined;
  if (raw.includes('GROUP') || raw.includes('VILLAGE') || raw.includes('COOPERATIVE')) return 'GROUP';
  if (raw === 'INDIVIDUAL' || raw === 'SME' || raw === 'CORPORATE') return raw;
  return raw;
}

/** Visibility levels that may be shown to borrowers in self-service channels. */
export function isClientFacingVisibility(level?: string | null): boolean {
  if (!level) return true;
  const v = String(level).toUpperCase();
  return v === 'PUBLIC' || v === 'SELF_SERVICE';
}

export function filterCreditOfficerActions(actions: string[] | undefined): string[] {
  if (!actions?.length) return [];
  return actions.filter((a) => CREDIT_OFFICER_ORIGINATION_ACTIONS.has(a));
}

export const TRANSITION_ACTIONS_NEEDING_REASON = new Set(['LO_RETURN_TO_CLIENT', 'CIO_RETURN_TO_LO']);

export type ReturnBlockerItem = { id: string; text: string; met: boolean };

export type ParsedReturnReason = {
  message: string;
  blockers: ReturnBlockerItem[];
};

export function normalizeStaffRole(role?: string | null): string {
  return String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export type StaffJobRoleSource = {
  backendRole?: string | null;
  role?: string | null;
  role_name?: string | null;
};

/** Job title from /staff/me — skips portal roles like `staff` / `client`. */
export function resolveStaffJobRole(user?: StaffJobRoleSource | null): string | undefined {
  const candidates = [user?.backendRole, user?.role_name, user?.role];
  for (const raw of candidates) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    const portal = value.toLowerCase();
    if (portal === 'client' || portal === 'staff' || portal === 'customer') continue;
    return value;
  }
  return undefined;
}

export function isLoanOfficerStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (r === 'LOAN_OFFICER' || r === 'OFFICER') return true;
  const compact = r.replace(/[._]/g, '');
  if (compact === 'LO') return true;
  return r.includes('LOAN') && r.includes('OFFICER');
}

export function isPortfolioManagerStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (r === 'PORTFOLIO_MANAGER' || r === 'PM' || r === 'PORTFOLIOMANAGER') return true;
  return r.includes('PORTFOLIO') && r.includes('MANAGER');
}

export function isAccountantStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  return r === 'ACCOUNTANT' || r.endsWith('_ACCOUNTANT');
}

export function isOperationsManagerStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (r === 'OPERATIONS_MANAGER' || r === 'OPS_MANAGER') return true;
  return r.includes('OPERATIONS') && r.includes('MANAGER');
}

export function isOperationsAssistantStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (r === 'OPERATIONS_ASSISTANT' || r === 'OPS_ASSISTANT') return true;
  return r.includes('OPERATIONS') && r.includes('ASSISTANT');
}

export function isOperationsOfficerStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (isOperationsManagerStaffRole(r) || isOperationsAssistantStaffRole(r)) return false;
  if (r === 'OPERATIONS_OFFICER' || r === 'OPS_OFFICER') return true;
  return r.includes('OPERATIONS') && r.includes('OFFICER');
}

export function isOperationsStaffRole(role?: string | null): boolean {
  return (
    isOperationsOfficerStaffRole(role) ||
    isOperationsManagerStaffRole(role) ||
    isOperationsAssistantStaffRole(role)
  );
}

export function isGceoStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (r === 'GCEO' || r === 'GENERAL_CHIEF_EXECUTIVE' || r === 'GENERAL_CHIEF_EXECUTIVE_OFFICER') {
    return true;
  }
  return r.includes('GENERAL') && r.includes('CHIEF') && r.includes('EXECUTIVE');
}

export function isCeoStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r || isGceoStaffRole(r)) return false;
  if (r === 'CEO' || r === 'CHIEF_EXECUTIVE' || r === 'CHIEF_EXECUTIVE_OFFICER') return true;
  return r.includes('CHIEF') && r.includes('EXECUTIVE');
}

export function isExecutiveStaffRole(role?: string | null): boolean {
  return isCeoStaffRole(role) || isGceoStaffRole(role);
}

export function isInternalAuditorStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r || r.includes('EXTERNAL')) return false;
  if (r === 'AUDITOR' || r === 'INTERNAL_AUDITOR') return true;
  return r.includes('AUDITOR') && r.includes('INTERNAL');
}

export function isExternalAuditorStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (r === 'EXTERNAL_AUDITOR') return true;
  return r.includes('EXTERNAL') && r.includes('AUDITOR');
}

export function isAuditorStaffRole(role?: string | null): boolean {
  return isInternalAuditorStaffRole(role) || isExternalAuditorStaffRole(role);
}

export function filterPortfolioManagerActions(actions: string[] | undefined): string[] {
  if (!actions?.length) return [];
  return actions.filter((a) => PORTFOLIO_MANAGER_ORIGINATION_ACTIONS.has(a));
}

export function filterAccountantActions(actions: string[] | undefined): string[] {
  if (!actions?.length) return [];
  return actions.filter((a) => ACCOUNTANT_ORIGINATION_ACTIONS.has(a));
}

export function filterLoanOfficerActions(actions: string[] | undefined): string[] {
  if (!actions?.length) return [];
  return actions.filter((a) => LOAN_OFFICER_ORIGINATION_ACTIONS.has(a));
}

export function parseReturnReasonPayload(raw?: string | null): ParsedReturnReason {
  const txt = (raw ?? '').trim();
  if (!txt) return { message: '', blockers: [] };
  if (txt.startsWith('{')) {
    try {
      const data = JSON.parse(txt) as { message?: string; blockers?: unknown[] };
      const msg = String(data.message ?? '').trim();
      const items: ReturnBlockerItem[] = [];
      if (Array.isArray(data.blockers)) {
        for (let i = 0; i < data.blockers.length; i++) {
          const row = data.blockers[i];
          if (row && typeof row === 'object' && 'text' in row) {
            const text = String((row as { text?: string }).text ?? '').trim();
            if (text) {
              items.push({
                id: String((row as { id?: string }).id ?? `blk-${i + 1}`),
                text,
                met: Boolean((row as { met?: boolean }).met),
              });
            }
          } else if (typeof row === 'string' && row.trim()) {
            items.push({ id: `blk-${i + 1}`, text: row.trim(), met: false });
          }
        }
      }
      return { message: msg, blockers: items };
    } catch {
      /* fall through */
    }
  }
  return { message: txt, blockers: [] };
}

export function buildReturnToClientReason(message: string, blockers: string[]): string {
  const rows = blockers
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `blk-${i + 1}`, text, met: false }));
  return JSON.stringify({ message: message.trim(), blockers: rows });
}

/**
 * Serialize a tagged "requested updates" payload for LO_RETURN_TO_CLIENT.
 * Preserves each blocker's `met` flag so the LO's tagging of addressed items
 * rides back through the client portal and into the re-certification trail.
 */
export function buildReturnToClientReasonWithItems(
  message: string,
  blockers: ReturnBlockerItem[]
): string {
  const rows = (blockers ?? [])
    .map((b) => ({ id: b.id || `blk-${Math.random().toString(36).slice(2, 8)}`, text: b.text.trim(), met: Boolean(b.met) }))
    .filter((r) => r.text.length > 0);
  return JSON.stringify({ message: message.trim(), blockers: rows });
}

/**
 * True when the application was sent back for rework and must be amended and
 * re-submitted before the release flow can be activated again. Mirrors the
 * dashboard `isApplicationReturnedForRework` — a terminal status
 * (REJECTED / WITHDRAWN / DISBURSED) always wins, so an ended application is
 * never shown as rework even if the stage string still reads `RETURNED_TO_LO`.
 */
export function isApplicationReturnedForRework(
  status: string | undefined,
  originationStage?: string | null,
  originationReturnReason?: string | null
): boolean {
  const st = String(status ?? '').toUpperCase();
  if (['REJECTED', 'WITHDRAWN', 'DISBURSED'].includes(st)) return false;
  const stage = String(originationStage ?? '').toUpperCase();
  if (stage === 'RETURNED_TO_LO') return true;
  return Boolean(originationReturnReason && originationReturnReason.trim().length > 0);
}

/** Mirror dashboard `submitBlockedReason` for LO submit-to-CIO gating. */
export function submitBlockedReason(orig: OriginationStatus | null | undefined): string | undefined {
  if (!orig || orig.ready_to_submit) return undefined;
  const blockerDetails = Array.isArray(orig.blocker_details)
    ? orig.blocker_details.filter(Boolean)
    : [];
  if (blockerDetails.length > 0) return blockerDetails.join(' ');
  const blockers = Array.isArray(orig.blockers) ? orig.blockers.filter(Boolean) : [];
  if (blockers.length > 0) return blockers.join(' · ');
  if (orig.members_missing_collateral?.length) {
    const missingList =
      (orig.members_missing_collateral_display?.length ?? 0) > 0
        ? orig.members_missing_collateral_display!.join(', ')
        : orig.members_missing_collateral.join(', ');
    return `Each allocated group member needs collateral with pledgor set to that member. Missing for: ${missingList}.`;
  }
  if (!orig.collateral_complete) {
    if (
      orig.required_collateral_value_minor != null &&
      orig.collateral_coverage_met === false
    ) {
      return 'Pledge collateral until the required security amount for this loan is met.';
    }
    return 'Add the collateral required by this product.';
  }
  if (!orig.guarantor_complete) return 'Add the guarantors required by this product.';
  if (orig.loan_documents_complete === false) {
    return 'Upload every required application document type (see checklist).';
  }
  if (
    orig.require_collateral_item_documentation &&
    orig.requires_collateral &&
    orig.collateral_documentation_complete === false
  ) {
    return 'Attach at least one file to each collateral record (title deed, photo, etc.).';
  }
  return 'Complete all CIO submission requirements shown in the checklist.';
}

export type NextStepInfo = { label: string; hint: string };

const NEXT_STEP_MAP: Record<string, NextStepInfo> = {
  collateral: {
    label: 'Add collateral',
    hint: 'Pledge property until the required security amount for this loan is met. One property is enough when its value covers the requirement.',
  },
  group_member_collateral: {
    label: 'Group member collateral',
    hint: 'Add collateral for each allocated member and set pledgor to that member before submitting.',
  },
  guarantor: {
    label: 'Add guarantors',
    hint: 'Add the required guarantors using the Guarantors section below. You can add them before or after collateral.',
  },
  loan_documents: {
    label: 'Upload documents',
    hint: 'Upload each required application document type from Application documents. Custom supporting files go under Other documents.',
  },
  collateral_documents: {
    label: 'Collateral attachments',
    hint: 'Attach at least one supporting file to every collateral line item.',
  },
  client_kyc: {
    label: 'Complete borrower KYC',
    hint: 'Finish the borrower KYC profile before submitting. For group loans this is the group parent — not each member.',
  },
  submit: {
    label: 'Ready to submit',
    hint: 'All CIO submission requirements are met. Use Submit to CIO at the bottom of this screen.',
  },
  awaiting_approval: {
    label: 'Awaiting approval',
    hint: 'Application is in the approval pipeline. No loan officer action required.',
  },
  disburse: {
    label: 'Pending disbursement',
    hint: 'Application is approved and awaiting disbursement (handled by accounting/operations).',
  },
  completed: {
    label: 'Completed',
    hint: 'Loan has been disbursed.',
  },
  awaiting_disbursement_release: {
    label: 'Awaiting second signer',
    hint: 'Dual-control disbursement release is pending (not a loan officer action).',
  },
  ops_officer_submit_to_manager: {
    label: 'Operations schedule',
    hint: 'Operations team is setting up the repayment schedule.',
  },
  ops_manager_acknowledge: {
    label: 'Operations acknowledgement',
    hint: 'Operations manager acknowledgement is pending.',
  },
  repayment_tracking: {
    label: 'Live repayments',
    hint: 'Loan is in live repayment servicing.',
  },
};

export function nextStepInfo(nextStep: string | undefined | null): NextStepInfo | null {
  if (!nextStep) return null;
  return NEXT_STEP_MAP[nextStep] ?? {
    label: nextStep.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    hint: `Next step from server: ${nextStep}`,
  };
}

export function showLoanOfficerOriginationPanel(
  status: string | undefined,
  originationStage?: string | null
): boolean {
  const st = String(status ?? '').toUpperCase();
  if (['WITHDRAWN', 'DISBURSED', 'APPROVED'].includes(st)) return false;
  // Rejected applications are reworkable by the loan officer (product swap, re-submit).
  if (st === 'REJECTED') return true;
  const stage = String(originationStage ?? '').toUpperCase();
  if (
    stage === 'SUBMITTED_TO_CIO' ||
    stage === 'CIO_VERIFIED_TO_PM' ||
    stage === 'SUBMITTED_TO_CEO' ||
    stage === 'SUBMITTED_TO_GCEO' ||
    stage === 'PENDING_DISBURSEMENT'
  ) {
    return false;
  }
  return ['DRAFT', 'SUBMITTED', 'PENDING_REVIEW'].includes(st) || stage === 'RETURNED_TO_LO';
}

const CIO_HANDOFF_STAGES = new Set([
  'SUBMITTED_TO_CIO',
  'CIO_VERIFIED_TO_PM',
  'SUBMITTED_TO_CEO',
  'SUBMITTED_TO_GCEO',
  'PENDING_DISBURSEMENT',
]);

export function loanOfficerCanSubmitToCio(
  status: string | undefined,
  originationStage?: string | null,
  suggestedActions?: string[] | null
): boolean {
  if (suggestedActions?.includes('SUBMIT_TO_CIO')) return true;
  const st = String(status ?? '').toUpperCase();
  const stage = String(originationStage ?? '').toUpperCase();
  if (CIO_HANDOFF_STAGES.has(stage)) return false;
  // Match the web BMS: keep the control visible for draft/submitted files still in the LO lane.
  // Rejected rework files are also re-submittable once the officer amends them.
  return st === 'DRAFT' || st === 'SUBMITTED' || st === 'REJECTED';
}

/**
 * LO may edit requested amount / term / purpose while the application is still
 * in the LO draft / returned lane. Locked once submitted to CIO or approved.
 */
export function loanOfficerCanEditCoreFields(
  status: string | undefined,
  originationStage?: string | null
): boolean {
  if (!showLoanOfficerOriginationPanel(status, originationStage)) return false;
  const st = String(status ?? '').toUpperCase();
  const stage = String(originationStage ?? '').toUpperCase();
  // Explicit lock after CIO handoff (panel already excludes these stages, keep belt-and-suspenders).
  if (
    stage === 'SUBMITTED_TO_CIO' ||
    stage === 'CIO_VERIFIED_TO_PM' ||
    stage === 'SUBMITTED_TO_CEO' ||
    stage === 'SUBMITTED_TO_GCEO' ||
    stage === 'PENDING_DISBURSEMENT'
  ) {
    return false;
  }
  return (
    st === 'DRAFT' ||
    st === 'REJECTED' ||
    stage === 'RETURNED_TO_LO' ||
    stage === 'PENDING_LO_ACTION' ||
    stage === 'DRAFT' ||
    stage === ''
  );
}
