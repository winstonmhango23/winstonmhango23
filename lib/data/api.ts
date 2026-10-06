/**
 * API data layer – cofi-bms-api on Railway.
 * All authenticated HTTP calls MUST use `api` from `@/lib/api-client` so 401
 * responses trigger token refresh + request replay (E7.7). Do not call `fetch`
 * directly for bearer-token requests in this module.
 * 
 * Error Handling:
 * - ApiClientError includes requestId for tracing
 * - Network errors automatically retry via offline-first layer
 * - 401 errors trigger token refresh automatically
 * - Use logger for debugging API issues
 */

import { api, ApiClientError } from '@/lib/api-client';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { performanceMonitor } from '@/lib/performance-monitor';
import { randomPassword } from '@/lib/random-password';
import { getStoredAuth } from '@/lib/storage';
import { uriToBase64 } from '@/lib/media/uri-to-base64';
import { trimGuarantorTextField } from './guarantor-catalog';
import type { GeolocationInput, GeolocationResponse } from './geolocation-types';
import type {
    GroupClientLeaderCustomCreate,
    GroupClientLeaderPatch,
    GroupClientLeaderResponse,
    GroupClientLeaderSlotUpsert,
    GroupLoanAggregateResponse,
    GroupMemberCreateInput,
    GroupOriginationValidateRequest,
    GroupOriginationValidateResponse,
} from './group-loan-types';
import type { ClientRow, LoanApplicationRow } from './types';
import type { OpsOriginationQueueRecord, OpsRepaymentRecord } from '@/lib/ops-records';

type ApiApp = {
  id: number;
  application_number: string;
  status: string;
  requested_amount: number;
  approved_amount?: number;
  requested_term_months: number;
  application_date: string;
  client_id?: number;
  client_name?: string;
  product_name?: string;
  loan_product_id?: number;
  purpose?: string;
  assigned_staff_name?: string;
  assigned_cio_id?: number | null;
  assigned_cio_name?: string | null;
  created_at?: string;
  group_loan_allocation?: Record<string, unknown> | null;
  origination_stage?: string | null;
  origination_return_reason?: string | null;
  application_notes?: string | null;
  loan_type?: string | null;
  selected_repayment_strategy?: string | null;
};

export type ApiLoansPage = {
  data: ApiLoan[];
  total: number;
  page: number;
  size: number;
  pages: number;
  credit_book?: string | null;
  book_totals?: { sme?: number; group?: number; agricultural?: number };
};

export type ApiLoan = {
  id: number;
  loan_account_number: string;
  client_id?: number;
  client_name?: string;
  product_name?: string;
  loan_product_id?: number;
  principal_amount: number;
  outstanding_principal: number;
  total_repaid?: number;
  status: string;
  next_due_date?: string;
  days_in_arrears?: number;
  interest_rate?: number;
  term_months?: number;
  /** Calendar days until next installment; negative if overdue (API). */
  days_until_next_repayment?: number | null;
  /** False until application origination reaches TRACKING_REPAYMENT. */
  repayment_tracking_live?: boolean;
  application_origination_stage?: string | null;
  /** Group facility viewer fields from GET /mobile/me/loan-progress. */
  is_group_facility?: boolean;
  my_share_principal_minor?: number | null;
  group_principal_minor?: number | null;
  my_share_outstanding_minor?: number | null;
  is_legacy?: boolean;
  loan_category?: string | null;
  legacy_classification?: string | null;
  legacy_booking_status?: string | null;
  allocation_id?: number | null;
  funding_fund_name?: string | null;
  funding_fund_id?: number | null;
  investment_assigned?: boolean | null;
  /** Source application ID for reallocation (group loans). */
  loan_application_id?: number | null;
};

export type ApiScheduleItem = {
  id?: number;
  installment_number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  paid_amount?: number;
  status: string;
};

export type ApiRepayment = {
  id: number;
  loan_id?: number;
  loan_account_number?: string;
  client_id?: number;
  client_name?: string;
  total_amount?: number;
  amount?: number;
  principal_amount?: number;
  interest_amount?: number;
  penalty_amount?: number;
  repayment_date: string;
  outstanding_principal_after?: number;
  status?: string;
  internal_status?: string;
  lifecycle_state?: string;
  manager_approval_status?: string;
  payment_method?: string;
  deposit_receipt_number?: string | null;
  reference_number?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  repayment_schema_version?: string;
  member_contributions?: Array<{ member_client_id: number; amount: number }>;
  member_contribution_details?: Array<{
    member_client_id: number;
    amount: number;
    member_full_name?: string | null;
  }>;
  sync_status?: 'pending' | 'synced' | 'failed';
};

export type ApiRepaymentLifecycleEvent = {
  id: number | string;
  event_type?: string | null;
  from_state?: string | null;
  to_state?: string | null;
  notes?: string | null;
  created_at?: string | null;
  triggered_by?: string | null;
};

export type ApiRepaymentLifecycleResponse = {
  events?: ApiRepaymentLifecycleEvent[] | null;
  lifecycle_state?: string | null;
};

/** Loan row from GET /repayments/due-today|overdue|upcoming */
export type ApiRepaymentOverviewItem = {
  id: number;
  loan_account_number: string;
  client_id: number;
  client_name?: string;
  product_name?: string;
  branch_id?: number;
  outstanding_principal: number;
  next_due_date?: string | null;
  next_due_amount?: number | null;
  days_in_arrears?: number;
  days_until_due?: number | null;
  status?: string;
  repayment_tracking_live?: boolean | null;
  credit_book?: string | null;
  is_legacy?: boolean | null;
  has_repayment_schedule?: boolean | null;
  /** Legacy book: schedule rows exist but were never activated — ops can start tracking. */
  schedule_tracking_pending?: boolean | null;
};

export type ApiStaffPermission = {
  id: number;
  name: string;
  module: string;
  action: string;
  description?: string | null;
};

export type ApiStaffDigestSummary = {
  due_today_count?: number;
  due_today_total_mwk?: number;
  overdue_count?: number;
  overdue_total_mwk?: number;
  upcoming_count?: number;
  upcoming_total_mwk?: number;
};

export type ApiStaffDigest = {
  staff_id: number;
  staff_name?: string;
  branch_id?: number;
  digest_date?: string;
  due_today?: ApiRepaymentOverviewItem[];
  overdue?: ApiRepaymentOverviewItem[];
  upcoming?: ApiRepaymentOverviewItem[];
  summary?: ApiStaffDigestSummary;
};

type PaginatedDataEnvelope<T> = {
  data?: T[];
  total?: number;
  page?: number;
  size?: number;
  pages?: number;
};

export type ApiLegacyRepaymentBookPage = PaginatedDataEnvelope<ApiRepaymentOverviewItem> & {
  credit_book?: string;
  book_totals?: { sme?: number; group?: number; agricultural?: number };
};

function unwrapDataList<T>(res: T[] | PaginatedDataEnvelope<T> | null | undefined): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return Array.isArray(res.data) ? res.data : [];
}

type ApiClient = {
  id: number;
  client_id?: string;
  full_name?: string;
  name?: string;
  email?: string;
  phone_number?: string;
  national_id?: string;
  address?: string;
  branch_id?: number;
  created_at?: string;
  is_verified?: boolean;
  is_active?: boolean;
  client_type?: string;
  parent_client_id?: number | null;
  member_count?: number | null;
  is_group_admin?: boolean;
  group_role?: string | null;
  /** KYC / extended profile (present on ClientResponse) */
  gender?: string | null;
  organization_name?: string | null;
  date_of_birth?: string | null;
  occupation?: string | null;
  employer?: string | null;
  monthly_income?: number | null;
  marital_status?: string | null;
  next_of_kin_name?: string | null;
  next_of_kin_phone?: string | null;
  next_of_kin_relationship?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  district_id?: number | null;
  district_name?: string | null;
  profile_photo_path?: string | null;
  id_document_path?: string | null;
  id_document_back_path?: string | null;
  group_constitution_path?: string | null;
  group_photo_path?: string | null;
};

export type ApiProduct = {
  id: number;
  name: string;
  code?: string;
  category?: string;
  is_agricultural_product?: boolean;
  minimum_amount?: number;
  maximum_amount?: number;
  minimum_term_months?: number;
  maximum_term_months?: number;
  term_unit?: string;
  repayment_frequency?: string;
  collateral_required?: boolean;
  requires_guarantor?: boolean;
  supported_repayment_strategies?: string[] | null;
  default_repayment_strategy?: string | null;
  /** Product-allowed collateral codes; empty/null = unrestricted. */
  accepted_collateral_types?: string[] | null;
  /** Minimum collateral coverage as % of loan amount (e.g. 200 = double). */
  min_collateral_coverage?: number | null;
  min_guarantors?: number | null;
  /** Client types allowed to apply (INDIVIDUAL, GROUP, SME, CORPORATE, COOPERATIVE, VILLAGE_BANKING_GROUP). NULL = all eligible. */
  eligible_client_types?: string[] | null;
  /** Visibility level (PUBLIC/INTERNAL/STAFF_ONLY/SELF_SERVICE). */
  visibility_level?: string | null;
};

export async function apiGetLoanProducts(token: string): Promise<ApiProduct[]> {
  performanceMonitor.mark('apiGetLoanProducts');
  try {
    logger.debug('Fetching staff loan products', { module: 'api' });
    const res = await api.get<ApiProduct[]>(
      `${config.products}?limit=50&active_window_only=true&compatible_with_actor=true`,
      token
    );
    const duration = performanceMonitor.measure('apiGetLoanProducts');
    logger.info(`Fetched ${res?.length ?? 0} staff loan products (${duration.toFixed(0)}ms)`, {
      module: 'api',
    });
    return res ?? [];
  } catch (error) {
    performanceMonitor.measure('apiGetLoanProducts');
    const message = error instanceof ApiClientError ? error.message : 'Unknown error';
    const requestId =
      error instanceof ApiClientError ? error.requestId : undefined;
    logger.error('Failed to fetch staff loan products', error instanceof Error ? error : new Error(message), {
      module: 'api',
      requestId,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}

/** Borrower catalog — client JWT → GET /mobile/loan-products */
export async function apiGetBorrowerLoanProducts(token: string): Promise<ApiProduct[]> {
  performanceMonitor.mark('apiGetBorrowerLoanProducts');
  try {
    logger.debug('Fetching borrower loan products', { module: 'api' });
    const res = await api.get<ApiProduct[]>(config.mobile.loanProducts, token);
    const duration = performanceMonitor.measure('apiGetBorrowerLoanProducts');
    logger.info(`Fetched ${res?.length ?? 0} borrower loan products (${duration.toFixed(0)}ms)`, {
      module: 'api',
    });
    return res ?? [];
  } catch (error) {
    performanceMonitor.measure('apiGetBorrowerLoanProducts');
    const message = error instanceof ApiClientError ? error.message : 'Unknown error';
    const requestId =
      error instanceof ApiClientError ? error.requestId : undefined;
    logger.error(
      'Failed to fetch borrower loan products',
      error instanceof Error ? error : new Error(message),
      { module: 'api', requestId }
    );
    throw error instanceof Error ? error : new Error(message);
  }
}

export type ApiCollateral = {
  id: number;
  collateral_type: string;
  description: string;
  estimated_value: number;
  registration_number?: string;
  other_type_label?: string | null;
  /** Group loans: primary member pledging this collateral (client PK). */
  pledgor_client_id?: number | null;
  /** Group loans: all members jointly pledging this collateral. */
  pledgor_client_ids?: number[] | null;
  status?: string;
  is_active?: boolean;
  geolocation?: GeolocationInput | GeolocationResponse | null;
  documents?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type ApiGuarantor = {
  id: number;
  client_id?: number | null;
  full_name: string;
  national_id?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  relationship_to_borrower?: string;
  occupation?: string;
  monthly_income?: number;
  guarantee_amount?: number;
  /** Group parent apps: member this guarantee is attributed to. */
  guaranteed_for_client_id?: number | null;
  status?: string;
  is_active?: boolean;
};

export type BorrowerGuarantorInput = {
  full_name: string;
  client_id?: number;
  national_id?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  relationship_to_borrower?: string;
  occupation?: string;
  monthly_income?: number;
  guarantee_amount?: number;
  guaranteed_for_client_id?: number;
};

export function appToRow(a: ApiApp): LoanApplicationRow {
  return {
    id: a.id,
    application_number: a.application_number,
    status: a.status,
    requested_amount: a.requested_amount,
    approved_amount: a.approved_amount,
    requested_term_months: a.requested_term_months,
    product_name: a.product_name ?? 'Loan',
    loan_product_id: a.loan_product_id,
    application_date: a.application_date?.slice(0, 10) ?? '',
    client_id: a.client_id?.toString(),
    client_name: a.client_name,
    purpose: a.purpose,
    assigned_staff_name: a.assigned_staff_name,
    assigned_cio_id: a.assigned_cio_id ?? null,
    assigned_cio_name: a.assigned_cio_name ?? null,
    created_at: a.created_at ?? new Date().toISOString(),
    group_loan_allocation: a.group_loan_allocation ?? undefined,
    origination_stage: a.origination_stage ?? null,
    origination_return_reason: a.origination_return_reason ?? null,
    application_notes: a.application_notes ?? undefined,
    loan_type: a.loan_type ?? undefined,
    selected_repayment_strategy: a.selected_repayment_strategy ?? undefined,
  };
}

export function mobileAppSummaryToRow(a: MobileLoanApplicationSummary): LoanApplicationRow {
  return {
    id: a.id,
    application_number: a.application_number,
    status: a.status,
    requested_amount: a.requested_amount,
    requested_term_months: a.requested_term_months ?? 12,
    product_name: a.product_name ?? 'Loan',
    loan_product_id: a.loan_product_id,
    application_date: a.created_at?.slice(0, 10) ?? '',
    purpose: a.purpose ?? undefined,
    created_at: a.created_at ?? new Date().toISOString(),
    origination_stage: a.origination_stage ?? null,
    origination_return_reason: a.origination_return_reason ?? null,
    application_notes: a.application_notes ?? undefined,
    loan_type: a.loan_type ?? undefined,
    selected_repayment_strategy: a.selected_repayment_strategy ?? undefined,
    is_group_application: Boolean(a.is_group_application),
    my_share_requested_amount_minor: a.my_share_requested_amount_minor ?? null,
    group_requested_amount_minor: a.group_requested_amount_minor ?? null,
  };
}

function coerceIsoDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  return undefined;
}

export function mobileLoanSummaryToApiLoan(l: MobileLoanSummary): ApiLoan {
  return {
    id: l.id,
    loan_account_number: l.loan_account_number ?? `LN-${l.id}`,
    client_id: l.client_id,
    principal_amount: l.principal_amount,
    outstanding_principal: l.outstanding_principal,
    total_repaid: l.total_repaid,
    status: l.status ?? 'ACTIVE',
    next_due_date: coerceIsoDate(l.next_due_date),
    days_until_next_repayment: l.days_until_next_due ?? null,
    repayment_tracking_live:
      l.repayment_tracking_live == null ? undefined : Boolean(l.repayment_tracking_live),
    is_group_facility: Boolean(l.is_group_facility),
    my_share_principal_minor: l.my_share_principal_minor ?? null,
    group_principal_minor: l.group_principal_minor ?? null,
    my_share_outstanding_minor: l.my_share_outstanding_minor ?? null,
  };
}

function clientToRow(c: ApiClient): ClientRow {
  const name = c.full_name ?? c.name ?? '';
  return {
    id: String(c.id),
    name,
    phone_number: c.phone_number ?? undefined,
    national_id: c.national_id ?? undefined,
    email: c.email ?? undefined,
    address: c.address ?? undefined,
    occupation: c.occupation ?? undefined,
    monthly_income: c.monthly_income ?? undefined,
    customer_number: c.client_id,
    created_at: c.created_at ?? new Date().toISOString(),
    is_verified: c.is_verified ?? true,
    is_active: c.is_active ?? true,
    client_type: c.client_type,
    parent_client_id:
      c.parent_client_id === undefined || c.parent_client_id === null ? undefined : String(c.parent_client_id),
    member_count: c.member_count ?? undefined,
    is_group_admin: c.is_group_admin,
    group_role: c.group_role ?? undefined,
    branch_id: c.branch_id ?? undefined,
    gender: c.gender ?? undefined,
    date_of_birth: c.date_of_birth ?? undefined,
    marital_status: c.marital_status ?? undefined,
    employer: c.employer ?? undefined,
    organization_name: c.organization_name ?? undefined,
    district_name: c.district_name ?? undefined,
    next_of_kin_name: c.next_of_kin_name ?? undefined,
    next_of_kin_phone: c.next_of_kin_phone ?? undefined,
    next_of_kin_relationship: c.next_of_kin_relationship ?? undefined,
    bank_account_number: c.bank_account_number ?? undefined,
    bank_account_name: c.bank_account_name ?? undefined,
    bank_name: c.bank_name ?? undefined,
    bank_branch: c.bank_branch ?? undefined,
    photo_uri: c.profile_photo_path?.trim() || undefined,
    id_document_uri: c.id_document_path?.trim() || undefined,
    id_document_back_uri: c.id_document_back_path?.trim() || undefined,
    group_constitution_uri: c.group_constitution_path?.trim() || undefined,
    group_photo_uri: c.group_photo_path?.trim() || undefined,
  };
}

// ─── Applications ─────────────────────────────────────────────────────────

function wrapWithPerf<T>(name: string, fn: () => Promise<T>): Promise<T> {
  performanceMonitor.mark(name);
  return fn().finally(() => { performanceMonitor.measure(name); });
}

export async function apiGetApplications(
  token: string,
  opts?: {
    clientId?: string;
    clientName?: string;
    branchId?: number;
    officerId?: number;
    supervisedOnly?: boolean;
    creditBook?: string;
    isAgricultural?: boolean;
  }
): Promise<LoanApplicationRow[]> {
  return wrapWithPerf('apiGetApplications', async () => {
  const role = (await getStoredAuth())?.user?.role;
  if (role === 'client') {
    // Share-aware list (includes parent group apps where this member is allocated).
    const res = await api.get<MobileLoanApplicationSummary[]>(
      `${config.apiBase}/mobile/me/loan-applications`,
      token
    );
    return (res ?? []).map(mobileAppSummaryToRow);
  }
  const params = new URLSearchParams();
  if (opts?.clientId) params.set('client_id', opts.clientId);
  if (opts?.branchId) params.set('branch_id', String(opts.branchId));
  if (opts?.officerId) params.set('officer_id', String(opts.officerId));
  if (opts?.supervisedOnly) params.set('supervised_only', 'true');
  if (opts?.creditBook) params.set('credit_book', opts.creditBook);
  if (opts?.isAgricultural === true) params.set('is_agricultural', 'true');
  if (opts?.isAgricultural === false) params.set('is_agricultural', 'false');
  // Backend defaults to 25 — staff pipeline/queue files after that would
  // disappear from the shared list and from ID-only detail fallbacks.
  params.set('limit', '500');
  
  const url = `${config.loans.applications}${params.toString() ? `?${params}` : ''}`;
  const res = await api.get<ApiApp[]>(url, token);
  return (res ?? []).map(appToRow);
  });
}

export type ApplicationDocumentInput = {
  uri: string;
  name: string;
  docType: string;
  mimeType?: string;
};

export async function apiCreateApplicationClient(
  token: string,
  input: {
    product_name: string;
    requested_amount: number;
    requested_term_months: number;
    purpose?: string;
    documents?: ApplicationDocumentInput[];
    loan_product_id?: number;
  }
): Promise<LoanApplicationRow> {
  // Client JWT cannot call staff /loans/products — use borrower catalog.
  let productId =
    input.loan_product_id != null && Number.isFinite(Number(input.loan_product_id))
      ? Number(input.loan_product_id)
      : NaN;
  if (!Number.isFinite(productId) || productId <= 0) {
    const products = await apiGetBorrowerLoanProducts(token);
    const product =
      products.find((p) => p.name === input.product_name) ?? products[0];
    if (!product) throw new Error('No loan products available');
    productId = product.id;
  }
  const body: Record<string, unknown> = {
    loan_product_id: productId,
    requested_amount: input.requested_amount,
    loan_purpose: input.purpose ?? 'General',
    repayment_frequency: 'MONTHLY',
    term_months: input.requested_term_months,
  };
  if (input.documents && input.documents.length > 0) {
    body.documents = await Promise.all(
      input.documents.map(async (d) => ({
        file_content: await uriToBase64(d.uri),
        file_name: d.name,
        doc_type: d.docType,
        mime_type: d.mimeType ?? 'application/octet-stream',
      }))
    );
  }
  const res = await api.post<ApiApp>(config.customer.loanApplications, body, token);
  return appToRow(res);
}

/** Add document to client's loan application (POST /customer/loan-applications/{id}/documents) */
export async function apiAddApplicationDocumentClient(
  token: string,
  applicationId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string }
): Promise<void> {
  const base64 = await uriToBase64(doc.uri);
  await api.post(
    `${config.customer.loanApplications}/${applicationId}/documents`,
    {
      file_content: base64,
      file_name: doc.name,
      doc_type: doc.docType,
      mime_type: doc.mimeType ?? 'application/octet-stream',
    },
    token
  );
}

/** Replace borrower application document before approval */
export async function apiUpdateApplicationDocumentClient(
  token: string,
  applicationId: number,
  documentId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string }
): Promise<void> {
  const base64 = await uriToBase64(doc.uri);
  await api.put(
    `${config.customer.loanApplications}/${applicationId}/documents/${documentId}`,
    {
      file_content: base64,
      file_name: doc.name,
      doc_type: doc.docType,
      mime_type: doc.mimeType ?? 'application/octet-stream',
    },
    token
  );
}

/** Soft-delete borrower application document before approval */
export async function apiDeleteApplicationDocumentClient(
  token: string,
  applicationId: number,
  documentId: number
): Promise<void> {
  await api.delete(
    `${config.customer.loanApplications}/${applicationId}/documents/${documentId}`,
    token
  );
}

/** Add document to loan application (staff - POST /loans/applications/{id}/documents) */
export async function apiAddApplicationDocumentStaff(
  token: string,
  applicationId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string; fileName?: string },
  staffId: number
): Promise<void> {
  const base64 = await uriToBase64(doc.uri);
  await api.post(
    `/loans/applications/${applicationId}/documents`,
    {
      name: doc.name,
      doc_type: doc.docType,
      file_content: base64,
      file_name: doc.fileName ?? doc.name,
      mime_type: doc.mimeType ?? 'application/octet-stream',
      uploaded_by: staffId,
    },
    token
  );
}

/** Replace application document (staff - PUT /loans/applications/{id}/documents/{documentId}) */
export async function apiUpdateApplicationDocumentStaff(
  token: string,
  applicationId: number,
  documentId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string; fileName?: string }
): Promise<void> {
  const base64 = await uriToBase64(doc.uri);
  await api.put(
    `/loans/applications/${applicationId}/documents/${documentId}`,
    {
      name: doc.name,
      doc_type: doc.docType,
      file_content: base64,
      file_name: doc.fileName ?? doc.name,
      mime_type: doc.mimeType ?? 'application/octet-stream',
    },
    token
  );
}

/** Soft-delete application document (staff - DELETE /loans/applications/{id}/documents/{documentId}) */
export async function apiDeleteApplicationDocumentStaff(
  token: string,
  applicationId: number,
  documentId: number
): Promise<void> {
  await api.delete(`/loans/applications/${applicationId}/documents/${documentId}`, token);
}

export async function apiCreateApplicationStaff(
  token: string,
  row: Omit<LoanApplicationRow, 'id' | 'created_at'> & {
    client_id?: string;
    group_loan_allocation?: Record<string, unknown>;
    loan_type?: string;
    application_notes?: string;
    loan_product_id?: number;
    selected_repayment_strategy?: string;
  }
): Promise<LoanApplicationRow> {
  const clientId = row.client_id ? parseInt(row.client_id, 10) : undefined;
  if (!clientId || isNaN(clientId)) throw new Error('Client ID required for staff application');

  // Use /clients/{id} (no list redirect). `/clients?…` without a trailing slash
  // 307-redirects to `/clients/?…` and React Native fetch drops Authorization → 401.
  const client = await api.get<ApiClient>(`/clients/${clientId}`, token);
  if (!client?.branch_id) throw new Error('Could not resolve client branch');

  let productId =
    row.loan_product_id != null && Number.isFinite(Number(row.loan_product_id))
      ? Number(row.loan_product_id)
      : NaN;
  if (!Number.isFinite(productId) || productId <= 0) {
    // Prefer relative staff catalog path (consistent auth header handling).
    const products = await apiGetLoanProducts(token);
    const product =
      products.find((p) => p.name === row.product_name) ?? products[0];
    if (!product) throw new Error('No loan products available');
    productId = product.id;
  }

  const body: Record<string, unknown> = {
    client_id: clientId,
    loan_product_id: productId,
    branch_id: client.branch_id,
    requested_amount: row.requested_amount,
    requested_term_months: row.requested_term_months,
    purpose: row.purpose,
    status: 'DRAFT',
  };
  if (row.loan_type) body.loan_type = row.loan_type;
  if (row.group_loan_allocation) body.group_loan_allocation = row.group_loan_allocation;
  if (row.application_notes?.trim()) body.application_notes = row.application_notes.trim();
  if (row.selected_repayment_strategy) body.selected_repayment_strategy = row.selected_repayment_strategy;
  const res = await api.post<ApiApp>('/loans/applications', body, token);
  return appToRow(res);
}

/** Pre-validate group member allocation before creating a draft application. */
export async function apiValidateGroupOrigination(
  token: string,
  body: GroupOriginationValidateRequest
): Promise<GroupOriginationValidateResponse> {
  return api.post<GroupOriginationValidateResponse>(
    '/loans/applications/validate-group-origination',
    body,
    token
  );
}

export type GroupReallocationResult = {
  application_id: number;
  allocation: { mode: string; member_client_ids: number[]; lines: Array<{ member_client_id: number; amount_minor: number }> };
  removed_member_client_ids: number[];
  added_member_client_ids: number[];
  total_amount_minor: number;
  version: number;
  reason: string | null;
};

/** Reallocate group loan amounts between members (e.g. drop departed member, redistribute share). */
export async function apiReallocateGroupAllocation(
  token: string,
  applicationId: number,
  body: {
    mode: 'equal' | 'custom';
    member_client_ids: number[];
    lines?: Array<{ member_client_id: number; amount_minor: number }>;
    reason?: string;
  }
): Promise<GroupReallocationResult> {
  return api.post<GroupReallocationResult>(
    config.loans.reallocateGroupAllocation(applicationId),
    { group_loan_allocation: body },
    token
  );
}

export async function apiGetApplication(token: string, id: number, isClient: boolean): Promise<LoanApplicationRow | null> {
  if (isClient) {
    const list = await api.get<ApiApp[]>(config.loans.myApplications, token);
    const found = (list ?? []).find((a) => a.id === id);
    return found ? appToRow(found) : null;
  }
  const res = await api.get<ApiApp>(`/loans/applications/${id}`, token);
  return res ? appToRow(res) : null;
}

export async function apiUpdateApplication(
  token: string,
  id: number,
  updates: {
    status?: string;
    approved_amount?: number;
    approved_term_months?: number;
    purpose?: string;
    group_loan_allocation?: Record<string, unknown> | null;
    requested_amount?: number;
    requested_term_months?: number;
    loan_product_id?: number;
    application_notes?: string;
    loan_type?: string;
    selected_repayment_strategy?: string;
  }
): Promise<void> {
  await api.put(`${config.loans.applications}/${id}`, updates, token);
}

export async function apiApproveApplication(
  token: string,
  id: number,
  approvedAmount?: number,
  approvedTermMonths?: number
): Promise<void> {
  await api.post(`/loans/applications/${id}/approve`, {
    approved_amount: approvedAmount,
    approved_term_months: approvedTermMonths,
  }, token);
}

export async function apiRejectApplication(token: string, id: number, reason?: string): Promise<void> {
  await api.post(`/loans/applications/${id}/reject`, { rejection_reason: reason }, token);
}

export type ApiBookingDeductionBasis = 'percentage' | 'amount';

/** Named first-booking payout deduction (mirrors backend `BookingDeductionSpec`). */
export type ApiBookingDeductionSpec = {
  title: string;
  description?: string | null;
  basis: ApiBookingDeductionBasis;
  /** Basis points for percentage deductions (10000 == 100%). */
  percentage_bps?: number | null;
  /** Custom amount in minor units (MWK × 100). */
  amount_minor?: number | null;
  /** Optional GL income/payable account code credited for this deduction. */
  gl_account_code?: string | null;
  /** Target group member client id. Omit for an individual client booking. */
  client_id?: number | null;
};

/** Payload for `POST /loans/applications/{id}/create-loan` (accountant booking). */
export type ApiDisburseBookingPayload = {
  release_immediately?: boolean;
  method?: string;
  reference_number?: string;
  mobile_money_number?: string;
  notes?: string;
  allocation_id?: number;
  deductions?: ApiBookingDeductionSpec[];
};

export async function apiDisburseApplication(
  token: string,
  id: number,
  payload: ApiDisburseBookingPayload = {}
): Promise<void> {
  await api.post(config.staff.loanBooking(id), payload, token);
}

/** Submit DRAFT application for review (DRAFT → PENDING_REVIEW) */
export async function apiSubmitApplicationForApproval(token: string, id: number): Promise<ApiApp> {
  return api.post<ApiApp>(`/loans/applications/${id}/submit-for-approval`, {}, token);
}

/** All possible origination stages in the multi-stage workflow. */
export const ORIGINATION_STAGES = [
  'DRAFT',
  'SUBMITTED_TO_CIO',
  'CIO_VERIFIED_TO_PM',
  'SUBMITTED_TO_CEO',
  'SUBMITTED_TO_GCEO',
  'PENDING_DISBURSEMENT',
  'DISBURSED',
  'RETURNED_TO_LO',
  'PENDING_LO_ACTION',
  'DISBURSED_OPS_QUEUE',
  'COMPLETED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type OriginationStage = typeof ORIGINATION_STAGES[number];

/** Origination status: next step (collateral, guarantor, submit, etc.) */
export type LoanDocumentChecklistItem = {
  doc_type: string;
  satisfied: boolean;
  source?: string | null;
  source_label?: string | null;
  label?: string | null;
};

export type OriginationKycBlocker = {
  code: string;
  message: string;
  client_id?: number | null;
  client_name?: string;
  client_kind?: 'parent' | 'member' | string;
  missing_fields?: Array<{ field: string; label: string }>;
  blocking?: boolean;
};

export type OriginationStatus = {
  application_id: number;
  status: string;
  origination_stage?: OriginationStage | null;
  origination_return_reason?: string | null;
  /** Backend may return group-specific steps; treat unknown values explicitly in UI. */
  next_step: string;
  collateral_count: number;
  guarantor_count: number;
  requires_collateral: boolean;
  requires_guarantor: boolean;
  effective_requires_guarantor?: boolean;
  guarantor_requirement_waived_by_group_mutual?: boolean;
  min_guarantors: number;
  collateral_complete: boolean;
  guarantor_complete: boolean;
  ready_to_submit: boolean;
  /** Loan amount used for coverage calc (approved if set, else requested), minor units. */
  loan_amount_minor_for_coverage?: number;
  /** Product min_collateral_coverage % (e.g. 200 = double the loan). */
  min_collateral_coverage_pct?: number | null;
  required_collateral_value_minor?: number | null;
  pledged_collateral_value_minor?: number;
  collateral_coverage_shortfall_minor?: number;
  collateral_coverage_met?: boolean;
  suggested_origination_actions?: string[];
  unified_approve_eligible?: boolean;
  needs_missing_approval_record?: boolean;
  members_missing_collateral?: number[];
  members_missing_collateral_display?: string[];
  blockers?: string[];
  blocker_details?: string[];
  kyc_blockers?: OriginationKycBlocker[];
  required_loan_document_types?: string[];
  missing_loan_document_types?: string[];
  loan_documents_checklist?: LoanDocumentChecklistItem[];
  loan_documents_complete?: boolean;
  require_collateral_item_documentation?: boolean;
  collateral_items_count?: number;
  collateral_items_with_documents?: number;
  collateral_items_missing_documents?: number;
  collateral_documentation_complete?: boolean;
  pending_release_disbursement_count?: number;
};

/** POST /loans/applications/{id}/origination/transition — action must match backend LoanOriginationAction. */
export type LoanOriginationTransitionBody = {
  action: string;
  reason?: string;
  approved_amount?: number;
  approved_term_months?: number;
  interest_rate?: number;
};

/** Borrower JWT: /mobile/me/session and group member credentials (Phase D). */
export type MobileClientSessionContext = {
  client_id: number;
  full_name: string;
  client_type?: string | null;
  parent_client_id?: number | null;
  dashboard_mode: 'individual' | 'group_member' | 'group_parent';
  group_parent_id?: number | null;
  can_provision_member_credentials: boolean;
  can_administer_group_roster?: boolean;
  can_manage_group_leaders?: boolean;
  can_edit_group_origination?: boolean;
  can_record_group_repayments: boolean;
  can_request_loan?: boolean;
  is_group_chairperson?: boolean;
  has_existing_loans?: boolean;
  kyc_completion_percentage?: number;
  kyc_required_percentage?: number;
  kyc_is_complete?: boolean;
  assigned_loan_officer_name?: string | null;
  registered_by_officer_name?: string | null;
};

export type LoanFormSchemaResponse = {
  form_type: string;
  label: string;
  sections: { key: string; label: string }[];
  fields: {
    key: string;
    label: string;
    type: string;
    section: string;
    required?: boolean;
    options?: string[];
    visible_when?: { field: string; equals: string };
  }[];
};

export type MobileGroupMemberCredentialsItem = {
  id: number;
  client_id: string;
  full_name: string;
  email?: string | null;
  has_password: boolean;
  is_verified: boolean;
  is_active?: boolean;
};

export type MobileLoanSummary = {
  id: number;
  loan_account_number?: string | null;
  status?: string | null;
  principal_amount: number;
  outstanding_principal: number;
  outstanding_interest: number;
  total_repaid: number;
  client_id: number;
  currency?: string | null;
  is_group_facility?: boolean;
  my_share_principal_minor?: number | null;
  group_principal_minor?: number | null;
  my_share_outstanding_minor?: number | null;
  next_due_date?: string | null;
  days_until_next_due?: number | null;
  repayment_tracking_live?: boolean | null;
};

export type MobileLoanProgressResponse = {
  my_loans: MobileLoanSummary[];
  group?: {
    parent_group_id: number;
    role: string;
    can_record_repayments: boolean;
    is_chairperson: boolean;
    aggregate?: Record<string, unknown>;
  } | null;
};

export type MobileLoanApplicationSummary = {
  id: number;
  application_number: string;
  status: string;
  origination_stage?: string | null;
  friendly_status?: string | null;
  loan_product_id: number;
  product_name?: string | null;
  requested_amount: number;
  requested_term_months?: number | null;
  purpose?: string | null;
  created_at?: string | null;
  is_group_application?: boolean;
  my_share_requested_amount_minor?: number | null;
  group_requested_amount_minor?: number | null;
};

export type MobileRepaymentScheduleItem = {
  id: number;
  installment_number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
};

export type MobileGroupMemberProfile = {
  id: number;
  client_id: string;
  full_name: string;
  email?: string | null;
  phone_number?: string | null;
  national_id?: string | null;
  address?: string | null;
  client_type?: string | null;
  group_role?: string | null;
  is_group_admin?: boolean;
  is_verified?: boolean;
  is_active?: boolean;
  occupation?: string | null;
  employer?: string | null;
};

export async function apiGetMobileSession(token: string): Promise<MobileClientSessionContext> {
  return api.get<MobileClientSessionContext>('/mobile/me/session', token);
}

export async function apiGetLoanFormForProduct(
  token: string,
  category?: string,
  productName?: string,
  clientId?: number
): Promise<LoanFormSchemaResponse> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (productName) params.set('product_name', productName);
  if (clientId && clientId > 0) params.set('client_id', String(clientId));
  const q = params.toString();
  return api.get<LoanFormSchemaResponse>(`/loan-forms/form-for-product${q ? `?${q}` : ''}`, token);
}

export async function apiGetLoanFormByType(
  token: string,
  formType: string,
  clientId?: number
): Promise<LoanFormSchemaResponse> {
  const params = new URLSearchParams();
  if (clientId && clientId > 0) params.set('client_id', String(clientId));
  const q = params.toString();
  return api.get<LoanFormSchemaResponse>(
    `/loan-forms/form-type/${encodeURIComponent(formType)}${q ? `?${q}` : ''}`,
    token
  );
}

export type MobileLoanApplicationCreateBody = {
  loan_product_id: number;
  requested_amount: number;
  requested_term_months: number;
  purpose: string;
  loan_type?: string;
  application_notes?: string;
  group_loan_allocation?: Record<string, unknown>;
  selected_repayment_strategy?: string;
  /** Offline idempotency key — replay returns the same draft. */
  client_reference?: string;
};

export type MobileLoanApplicationUpdateBody = {
  requested_amount?: number;
  requested_term_months?: number;
  purpose?: string;
  application_notes?: string;
  selected_repayment_strategy?: string;
};

export async function apiCreateMobileLoanApplication(
  token: string,
  body: MobileLoanApplicationCreateBody
): Promise<LoanApplicationRow> {
  const res = await api.post<ApiApp>('/mobile/loan-applications', body, token);
  return appToRow(res);
}

export async function apiUpdateMobileLoanApplication(
  token: string,
  applicationId: number,
  body: MobileLoanApplicationUpdateBody
): Promise<LoanApplicationRow> {
  const res = await api.patch<ApiApp>(`/mobile/loan-applications/${applicationId}`, body, token);
  return appToRow(res);
}

export async function apiDeleteMobileLoanApplication(
  token: string,
  applicationId: number
): Promise<void> {
  await api.delete(`/mobile/loan-applications/${applicationId}`, token);
}

export async function apiValidateMobileGroupOrigination(
  token: string,
  body: GroupOriginationValidateRequest & { declared_group_mutual_guarantee_pathway?: boolean }
): Promise<GroupOriginationValidateResponse & { blockers?: string[]; blocker_details?: string[] }> {
  return api.post('/mobile/loan-applications/validate-group-origination', body, token);
}

export async function apiGetMobileGroupMembersCredentials(
  token: string
): Promise<MobileGroupMemberCredentialsItem[]> {
  const res = await api.get<MobileGroupMemberCredentialsItem[]>('/mobile/group/members', token);
  return res ?? [];
}

export async function apiPutMobileGroupMemberCredentials(
  token: string,
  memberClientId: number,
  body: { email?: string; password?: string }
): Promise<MobileGroupMemberCredentialsItem> {
  return api.put<MobileGroupMemberCredentialsItem>(
    `/mobile/group/members/${memberClientId}/credentials`,
    body,
    token
  );
}

export type MobileGroupMemberPortalCreate = {
  client_id: string;
  full_name: string;
  national_id?: string | null;
  phone_number?: string | null;
  email?: string | null;
  password?: string | null;
  address?: string | null;
  is_chairperson?: boolean;
};

export type MobileGroupMemberPortalUpdate = {
  full_name?: string;
  national_id?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  occupation?: string | null;
  employer?: string | null;
  is_active?: boolean;
};

export async function apiGetMobileProposedMemberClientId(token: string): Promise<string> {
  try {
    const res = await api.get<{ client_id: string }>(
      '/mobile/me/proposed-member-client-id',
      token
    );
    if (res?.client_id?.trim()) return res.client_id.trim();
  } catch {
    /* fall through to legacy path */
  }
  const legacy = await api.get<{ client_id: string }>('/mobile/group/proposed-client-id', token);
  return legacy?.client_id?.trim() || '';
}

export async function apiCreateMobileGroupMember(
  token: string,
  body: MobileGroupMemberPortalCreate
): Promise<MobileGroupMemberProfile> {
  return api.post<MobileGroupMemberProfile>('/mobile/group/members', body, token);
}

export async function apiPatchMobileGroupMember(
  token: string,
  memberClientId: number,
  body: MobileGroupMemberPortalUpdate
): Promise<MobileGroupMemberProfile> {
  return api.patch<MobileGroupMemberProfile>(
    `/mobile/group/members/${memberClientId}`,
    body,
    token
  );
}

export async function apiGetMobileGroupMemberProfile(
  token: string,
  memberId: number
): Promise<MobileGroupMemberProfile> {
  return api.get<MobileGroupMemberProfile>(`/mobile/group/members/${memberId}`, token);
}

export async function apiGetMobileGroupMemberLoans(
  token: string,
  memberId: number
): Promise<MobileLoanSummary[]> {
  const res = await api.get<MobileLoanSummary[]>(`/mobile/group/members/${memberId}/loans`, token);
  return res ?? [];
}

export async function apiGetMobileGroupLeaders(
  token: string
): Promise<GroupClientLeaderResponse[]> {
  const res = await api.get<GroupClientLeaderResponse[]>(config.mobile.groupLeaders, token);
  return res ?? [];
}

export async function apiUpsertMobileGroupLeaderSlot(
  token: string,
  body: GroupClientLeaderSlotUpsert
): Promise<GroupClientLeaderResponse> {
  return api.put<GroupClientLeaderResponse>(config.mobile.groupLeaderSlot, body, token);
}

export async function apiCreateMobileCustomGroupLeader(
  token: string,
  body: GroupClientLeaderCustomCreate
): Promise<GroupClientLeaderResponse> {
  return api.post<GroupClientLeaderResponse>(config.mobile.groupLeaderCustom, body, token);
}

export async function apiPatchMobileGroupLeader(
  token: string,
  leaderId: number,
  body: GroupClientLeaderPatch
): Promise<GroupClientLeaderResponse> {
  return api.patch<GroupClientLeaderResponse>(config.mobile.groupLeaderItem(leaderId), body, token);
}

export async function apiDeleteMobileGroupLeader(token: string, leaderId: number): Promise<void> {
  await api.delete(config.mobile.groupLeaderItem(leaderId), token);
}

export async function apiGetMobileLoanRepaymentSchedule(
  token: string,
  loanId: number
): Promise<MobileRepaymentScheduleItem[]> {
  const res = await api.get<MobileRepaymentScheduleItem[]>(
    `/mobile/me/loans/${loanId}/repayment-schedule`,
    token
  );
  return res ?? [];
}

/** Get collateral for an application */
export async function apiGetApplicationCollateral(token: string, applicationId: number): Promise<ApiCollateral[]> {
  const res = await api.get<ApiCollateral[]>(`/loans/applications/${applicationId}/collateral`, token);
  return res ?? [];
}

/** Get guarantors for an application */
export async function apiGetApplicationGuarantors(token: string, applicationId: number): Promise<ApiGuarantor[]> {
  const res = await api.get<ApiGuarantor[]>(`/loans/applications/${applicationId}/guarantors`, token);
  return res ?? [];
}

/** Add guarantor to application */
export async function apiAddApplicationGuarantor(
  token: string,
  applicationId: number,
  guarantor: {
    client_id?: number;
    full_name: string;
    national_id?: string;
    email?: string;
    phone_number?: string;
    address?: string;
    relationship_to_borrower?: string;
    occupation?: string;
    monthly_income?: number;
    guarantee_amount?: number;
    guaranteed_for_client_id?: number;
  }
): Promise<ApiGuarantor> {
  const body: Record<string, unknown> = {
    full_name: guarantor.full_name,
  };
  if (guarantor.client_id != null && guarantor.client_id > 0) body.client_id = guarantor.client_id;
  const nationalId = trimGuarantorTextField(guarantor.national_id);
  const email = trimGuarantorTextField(guarantor.email);
  const phone = trimGuarantorTextField(guarantor.phone_number);
  const address = trimGuarantorTextField(guarantor.address);
  const relationship = trimGuarantorTextField(guarantor.relationship_to_borrower);
  const occupation = trimGuarantorTextField(guarantor.occupation);
  if (nationalId) body.national_id = nationalId;
  if (email) body.email = email;
  if (phone) body.phone_number = phone;
  if (address) body.address = address;
  if (relationship) body.relationship_to_borrower = relationship;
  if (occupation) body.occupation = occupation;
  if (guarantor.monthly_income != null && guarantor.monthly_income > 0) {
    body.monthly_income = guarantor.monthly_income;
  }
  if (guarantor.guarantee_amount != null && guarantor.guarantee_amount > 0) {
    body.guarantee_amount = guarantor.guarantee_amount;
  }
  if (guarantor.guaranteed_for_client_id != null && guarantor.guaranteed_for_client_id > 0) {
    body.guaranteed_for_client_id = guarantor.guaranteed_for_client_id;
  }
  return api.post<ApiGuarantor>(`/loans/applications/${applicationId}/guarantors`, body, token);
}

/** Delete guarantor from application */
export async function apiDeleteApplicationGuarantor(
  token: string,
  applicationId: number,
  guarantorId: number
): Promise<void> {
  await api.delete(`/loans/applications/${applicationId}/guarantors/${guarantorId}`, token);
}

/** Get guarantors for a loan */
export async function apiGetLoanGuarantors(token: string, loanId: number): Promise<ApiGuarantor[]> {
  const res = await api.get<ApiGuarantor[]>(`/loans/${loanId}/guarantors`, token);
  return res ?? [];
}

/** Add guarantor to a loan */
export async function apiAddLoanGuarantor(
  token: string,
  loanId: number,
  guarantor: {
    client_id?: number;
    full_name: string;
    national_id?: string;
    email?: string;
    phone_number?: string;
    address?: string;
    relationship_to_borrower?: string;
    occupation?: string;
    monthly_income?: number;
    guarantee_amount?: number;
  }
): Promise<ApiGuarantor | null> {
  const body: Record<string, unknown> = {
    full_name: guarantor.full_name,
  };
  if (guarantor.client_id != null && guarantor.client_id > 0) body.client_id = guarantor.client_id;
  const nationalId = trimGuarantorTextField(guarantor.national_id);
  const email = trimGuarantorTextField(guarantor.email);
  const phone = trimGuarantorTextField(guarantor.phone_number);
  const address = trimGuarantorTextField(guarantor.address);
  const relationship = trimGuarantorTextField(guarantor.relationship_to_borrower);
  const occupation = trimGuarantorTextField(guarantor.occupation);
  if (nationalId) body.national_id = nationalId;
  if (email) body.email = email;
  if (phone) body.phone_number = phone;
  if (address) body.address = address;
  if (relationship) body.relationship_to_borrower = relationship;
  if (occupation) body.occupation = occupation;
  if (guarantor.monthly_income != null && guarantor.monthly_income > 0) {
    body.monthly_income = guarantor.monthly_income;
  }
  if (guarantor.guarantee_amount != null && guarantor.guarantee_amount > 0) {
    body.guarantee_amount = guarantor.guarantee_amount;
  }
  return api.post<ApiGuarantor>(`/loans/${loanId}/guarantors`, body, token);
}

/** Remove guarantor from a loan */
export async function apiRemoveLoanGuarantor(
  token: string,
  loanId: number,
  guarantorId: number
): Promise<void> {
  await api.delete(`/loans/${loanId}/guarantors/${guarantorId}`, token);
}

/** Delete collateral from application */
export async function apiDeleteApplicationCollateral(
  token: string,
  applicationId: number,
  collateralId: number
): Promise<void> {
  await api.delete(`/loans/applications/${applicationId}/collateral/${collateralId}`, token);
}

/** Get collateral registered on an active loan */
export async function apiGetLoanCollateral(token: string, loanId: number): Promise<ApiCollateral[]> {
  const res = await api.get<ApiCollateral[]>(`/loans/${loanId}/collateral`, token);
  return res ?? [];
}

/** Add collateral directly on an active loan */
export async function apiAddLoanCollateral(
  token: string,
  loanId: number,
  collateral: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    registration_number?: string;
    other_type_label?: string;
    document_keys?: Array<{ key: string; file_name: string; doc_type?: string }>;
  }
): Promise<ApiCollateral> {
  return api.post<ApiCollateral>(`/loans/${loanId}/collateral`, collateral, token);
}

// ─── Loans ─────────────────────────────────────────────────────────────────

export async function apiGetMyLoans(token: string): Promise<ApiLoan[]> {
  return wrapWithPerf('apiGetMyLoans', async () => {
    // Prefer share-aware progress endpoint (group members see parent facilities + my_share_*).
    try {
      const progress = await api.get<MobileLoanProgressResponse>(
        `${config.apiBase}/mobile/me/loan-progress`,
        token
      );
      const rows = progress?.my_loans ?? [];
      if (rows.length > 0 || progress != null) {
        return rows.map(mobileLoanSummaryToApiLoan);
      }
    } catch {
      /* fall through to legacy my-loans */
    }
    const res = await api.get<ApiLoan[]>(`${config.loans.myLoans}?limit=200`, token);
    return res ?? [];
  });
}

/** Staff in-app notifications (GET /staff/notifications). */
export type StaffNotificationRow = {
  id: number;
  staff_id: number;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  action_url?: string | null;
  priority: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  read_at?: string | null;
};

export async function apiGetStaffNotifications(
  token: string,
  opts?: { status?: string; limit?: number }
): Promise<StaffNotificationRow[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  params.set('limit', String(opts?.limit ?? 100));
  const q = params.toString();
  const res = await api.get<StaffNotificationRow[]>(`${config.staff.notifications}?${q}`, token);
  return res ?? [];
}

export async function apiGetStaffNotificationsUnreadCount(token: string): Promise<number> {
  const res = await api.get<{ count: number }>(config.staff.notificationsUnreadCount, token);
  return res?.count ?? 0;
}

export async function apiMarkStaffNotificationRead(token: string, notificationId: number): Promise<StaffNotificationRow> {
  return api.put<StaffNotificationRow>(`${config.staff.notifications}/${notificationId}/read`, {}, token);
}

export async function apiMarkAllStaffNotificationsRead(token: string): Promise<{ marked: number }> {
  return api.put<{ marked: number }>(`${config.staff.notifications}/read-all`, {}, token);
}

/** Customer portal notifications */
export type CustomerNotificationRow = {
  id: number;
  client_id: number;
  notification_type: string;
  title: string;
  message: string;
  action_url?: string | null;
  expires_at?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  is_active: boolean;
};

export async function apiGetCustomerNotifications(
  token: string,
  unreadOnly?: boolean
): Promise<CustomerNotificationRow[]> {
  const q = unreadOnly ? '?unread_only=true' : '';
  const res = await api.get<CustomerNotificationRow[]>(`${config.customer.notifications}${q}`, token);
  return res ?? [];
}

export async function apiGetCustomerNotification(token: string, id: number): Promise<CustomerNotificationRow> {
  return api.get<CustomerNotificationRow>(`${config.customer.notifications}/${id}`, token);
}

export async function apiMarkCustomerNotificationRead(token: string, id: number): Promise<CustomerNotificationRow> {
  return api.post<CustomerNotificationRow>(`${config.customer.notifications}/${id}/read`, {}, token);
}

export async function apiGetCustomerNotificationsUnreadCount(token: string): Promise<number> {
  return api.get<number>(config.customer.notificationsUnreadCount, token);
}

/** Borrower application origination / escalation (read-only). */
export type MobileApplicationWorkflowStep = {
  key: string;
  label: string;
  state: 'pending' | 'current' | 'complete';
};

export type MobileApplicationWorkflowResponse = {
  application_id: number;
  status: string;
  origination_stage?: string | null;
  origination_return_reason?: string | null;
  friendly_status?: string | null;
  steps: MobileApplicationWorkflowStep[];
};

export type MobileReturnBlockerItem = {
  id: string;
  text: string;
  met: boolean;
};

export type MobileReturnBlockersPayload = {
  message: string;
  blockers: MobileReturnBlockerItem[];
};

export async function apiGetBorrowerOriginationReadiness(
  token: string,
  applicationId: number
): Promise<OriginationStatus> {
  return api.get<OriginationStatus>(
    config.mobile.applicationOriginationReadiness(applicationId),
    token
  );
}

export async function apiSubmitApplicationToLoanOfficer(
  token: string,
  applicationId: number
): Promise<ApiApp> {
  return api.post<ApiApp>(
    config.mobile.submitApplicationToLoanOfficer(applicationId),
    {},
    token
  );
}

export async function apiWithdrawLoanApplication(
  token: string,
  applicationId: number
): Promise<ApiApp> {
  return api.post<ApiApp>(config.mobile.withdrawApplication(applicationId), {}, token);
}

export async function apiGetReturnBlockers(
  token: string,
  applicationId: number
): Promise<MobileReturnBlockersPayload> {
  return api.get<MobileReturnBlockersPayload>(
    config.mobile.returnBlockers(applicationId),
    token
  );
}

export async function apiUpdateReturnBlocker(
  token: string,
  applicationId: number,
  blockerId: string,
  met: boolean
): Promise<MobileReturnBlockersPayload> {
  return api.patch<MobileReturnBlockersPayload>(
    config.mobile.returnBlockers(applicationId),
    { blocker_id: blockerId, met },
    token
  );
}

// ─── Borrower collateral (client JWT → /mobile/*) ───────────────────────────

export async function apiGetBorrowerApplicationCollateral(
  token: string,
  applicationId: number
): Promise<ApiCollateral[]> {
  const res = await api.get<ApiCollateral[]>(config.mobile.applicationCollateral(applicationId), token);
  return res ?? [];
}

export async function apiAddBorrowerApplicationCollateral(
  token: string,
  applicationId: number,
  collateral: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    registration_number?: string;
    other_type_label?: string;
    guarantee_property?: string;
    pledgor_client_id?: number;
    pledgor_client_ids?: number[];
    geolocation?: GeolocationInput;
    document_keys?: Array<{ key: string; file_name: string; doc_type?: string }>;
  }
): Promise<ApiCollateral> {
  const body: Record<string, unknown> = {
    loan_application_id: applicationId,
    collateral_type: collateral.collateral_type,
    description: collateral.description,
    estimated_value: collateral.estimated_value,
    registration_number: collateral.registration_number,
    // Geolocation is applied in a follow-up PUT so create stays fast/reliable on mobile.
  };
  if (collateral.guarantee_property?.trim()) body.guarantee_property = collateral.guarantee_property.trim();
  if (collateral.other_type_label?.trim()) body.other_type_label = collateral.other_type_label.trim();
  if (collateral.pledgor_client_ids && collateral.pledgor_client_ids.length > 0) {
    const pledgorIds = collateral.pledgor_client_ids.filter((id) => id > 0);
    body.pledgor_client_ids = pledgorIds;
    body.pledgor_client_id = pledgorIds[0];
  } else if (collateral.pledgor_client_id != null && collateral.pledgor_client_id > 0) {
    body.pledgor_client_id = collateral.pledgor_client_id;
  }
  if (collateral.document_keys?.length) body.document_keys = collateral.document_keys;
  return api.post<ApiCollateral>(config.mobile.applicationCollateral(applicationId), body, token);
}

export async function apiUpdateBorrowerApplicationCollateral(
  token: string,
  applicationId: number,
  collateralId: number,
  update: { geolocation?: GeolocationInput }
): Promise<ApiCollateral> {
  return api.put<ApiCollateral>(
    config.mobile.applicationCollateralItem(applicationId, collateralId),
    update,
    token
  );
}

export type CollateralSummary = {
  total_items: number;
  total_estimated_value_minor: number;
  by_type?: Record<string, Record<string, unknown>>;
  by_pledgor?: Record<string, Record<string, unknown>>;
};

export async function apiGetBorrowerApplicationCollateralSummary(
  token: string,
  applicationId: number
): Promise<CollateralSummary | null> {
  try {
    return await api.get<CollateralSummary>(
      config.mobile.applicationCollateralSummary(applicationId),
      token
    );
  } catch {
    return null;
  }
}

export async function apiPatchBorrowerApplicationCollateralBatch(
  token: string,
  applicationId: number,
  items: Array<{ collateral_id: number; update: Record<string, unknown> }>
): Promise<ApiCollateral[]> {
  const res = await api.patch<ApiCollateral[]>(
    config.mobile.applicationCollateralBatch(applicationId),
    { items },
    token
  );
  return Array.isArray(res) ? res : [];
}

export type BorrowerApplicationDocument = {
  id: number;
  document_name?: string | null;
  file_name?: string | null;
  doc_type?: string | null;
  document_type?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
};

export async function apiGetBorrowerApplicationDocuments(
  token: string,
  applicationId: number
): Promise<BorrowerApplicationDocument[]> {
  const res = await api.get<BorrowerApplicationDocument[]>(
    config.mobile.applicationDocuments(applicationId),
    token
  );
  return Array.isArray(res) ? res : [];
}

/** Profile documents from customer portal (GET /customer/documents). */
export type CustomerPortalDocument = {
  id: number;
  document_type: string;
  file_name: string;
  upload_date?: string;
  is_verified?: boolean;
  mime_type?: string | null;
  client_upload_notes?: string | null;
  is_active?: boolean;
};

export async function apiGetCustomerDocuments(token: string): Promise<CustomerPortalDocument[]> {
  const res = await api.get<CustomerPortalDocument[]>(config.customer.documents, token);
  return Array.isArray(res) ? res : [];
}

export async function apiUploadCustomerDocument(
  token: string,
  doc: {
    document_type: string;
    file_name: string;
    uri: string;
    mime_type?: string;
    client_upload_notes?: string | null;
  }
): Promise<CustomerPortalDocument> {
  const base64 = await uriToBase64(doc.uri);
  return api.post<CustomerPortalDocument>(
    config.customer.documents,
    {
      document_type: doc.document_type,
      file_name: doc.file_name,
      file_content: base64,
      mime_type: doc.mime_type ?? 'application/octet-stream',
      client_upload_notes: doc.client_upload_notes ?? undefined,
    },
    token
  );
}

export async function apiGetBorrowerCollateralVault(token: string): Promise<ApiCollateral[]> {
  const res = await api.get<ApiCollateral[]>(config.mobile.collateralVault, token);
  return res ?? [];
}

export async function apiAddBorrowerCollateralVaultItem(
  token: string,
  data: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    other_type_label?: string;
    registration_number?: string;
    geolocation?: GeolocationInput;
    document_keys?: Array<{ key: string; file_name: string; doc_type?: string }>;
  }
): Promise<ApiCollateral> {
  const body: Record<string, unknown> = {
    collateral_type: data.collateral_type,
    description: data.description,
    estimated_value: data.estimated_value,
    registration_number: data.registration_number,
    geolocation: data.geolocation,
  };
  if (data.other_type_label?.trim()) body.other_type_label = data.other_type_label.trim();
  if (data.document_keys?.length) body.document_keys = data.document_keys;
  return api.post<ApiCollateral>(config.mobile.collateralVault, body, token);
}

export async function apiSetBorrowerVaultCollateralLocation(
  token: string,
  collateralId: number,
  location: GeolocationInput
): Promise<GeolocationResponse> {
  return api.put<GeolocationResponse>(
    config.mobile.collateralVaultLocation(collateralId),
    location,
    token
  );
}

/** Attach a saved vault collateral row to an application (portal parity). */
export async function apiAttachBorrowerVaultCollateralToApplication(
  token: string,
  collateralId: number,
  applicationId: number
): Promise<ApiCollateral> {
  return api.post<ApiCollateral>(
    config.mobile.collateralVaultAttach(collateralId, applicationId),
    {},
    token
  );
}

/** Attach a saved catalog guarantor to an application (portal parity). */
export async function apiAttachBorrowerCatalogGuarantorToApplication(
  token: string,
  guarantorId: number,
  applicationId: number
): Promise<ApiGuarantor> {
  return api.post<ApiGuarantor>(
    config.mobile.guarantorCatalogAttach(guarantorId, applicationId),
    {},
    token
  );
}

/** Staff: attach vault collateral to application without recreating. */
export async function apiStaffAttachVaultCollateralToApplication(
  token: string,
  applicationId: number,
  collateralId: number
): Promise<ApiCollateral> {
  return api.post<ApiCollateral>(
    config.mobile.staffAttachVaultCollateral(applicationId, collateralId),
    {},
    token
  );
}

/** Staff: attach catalog guarantor to application without recreating. */
export async function apiStaffAttachCatalogGuarantorToApplication(
  token: string,
  applicationId: number,
  guarantorId: number
): Promise<ApiGuarantor> {
  return api.post<ApiGuarantor>(
    config.mobile.staffAttachCatalogGuarantor(applicationId, guarantorId),
    {},
    token
  );
}

// ─── Borrower guarantors (client JWT → /mobile/*) ───────────────────────────

export async function apiGetBorrowerApplicationGuarantors(
  token: string,
  applicationId: number
): Promise<ApiGuarantor[]> {
  const res = await api.get<ApiGuarantor[]>(config.mobile.applicationGuarantors(applicationId), token);
  return res ?? [];
}

export async function apiAddBorrowerApplicationGuarantor(
  token: string,
  applicationId: number,
  guarantor: BorrowerGuarantorInput
): Promise<ApiGuarantor> {
  const body: Record<string, unknown> = {
    loan_application_id: applicationId,
    full_name: guarantor.full_name,
  };
  if (guarantor.client_id != null && guarantor.client_id > 0) body.client_id = guarantor.client_id;
  const nationalId = trimGuarantorTextField(guarantor.national_id);
  const email = trimGuarantorTextField(guarantor.email);
  const phone = trimGuarantorTextField(guarantor.phone_number);
  const address = trimGuarantorTextField(guarantor.address);
  const relationship = trimGuarantorTextField(guarantor.relationship_to_borrower);
  const occupation = trimGuarantorTextField(guarantor.occupation);
  if (nationalId) body.national_id = nationalId;
  if (email) body.email = email;
  if (phone) body.phone_number = phone;
  if (address) body.address = address;
  if (relationship) body.relationship_to_borrower = relationship;
  if (occupation) body.occupation = occupation;
  if (guarantor.monthly_income != null && guarantor.monthly_income > 0) {
    body.monthly_income = guarantor.monthly_income;
  }
  if (guarantor.guarantee_amount != null && guarantor.guarantee_amount > 0) {
    body.guarantee_amount = guarantor.guarantee_amount;
  }
  if (guarantor.guaranteed_for_client_id != null && guarantor.guaranteed_for_client_id > 0) {
    body.guaranteed_for_client_id = guarantor.guaranteed_for_client_id;
  }
  return api.post<ApiGuarantor>(config.mobile.applicationGuarantors(applicationId), body, token);
}

export async function apiDeleteBorrowerApplicationGuarantor(
  token: string,
  applicationId: number,
  guarantorId: number
): Promise<void> {
  await api.delete(config.mobile.applicationGuarantorItem(applicationId, guarantorId), token);
}

export async function apiGetMobileApplicationWorkflow(
  token: string,
  applicationId: number
): Promise<MobileApplicationWorkflowResponse> {
  return api.get<MobileApplicationWorkflowResponse>(`/mobile/applications/${applicationId}/workflow`, token);
}

/** Staff: GET /loans returns { data, total, page, size, pages }. Use assigned_only=true for "My Portfolio Loans". */
export async function apiGetLoans(
  token: string,
  opts?: {
    limit?: number;
    skip?: number;
    assigned_only?: boolean;
    supervised_only?: boolean;
    status?: string;
    credit_book?: string;
    is_agricultural?: boolean;
    is_legacy?: boolean;
    include_funding_preview?: boolean;
    legacy_queue?: 'active' | 'archive' | 'needs_verification' | 'sent_to_accountant';
    has_balance?: boolean;
  }
): Promise<ApiLoansPage> {
  return wrapWithPerf('apiGetLoans', async () => {
  const limit = opts?.limit ?? 20;
  const skip = opts?.skip ?? 0;
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (opts?.assigned_only) params.set('assigned_only', 'true');
  if (opts?.supervised_only) params.set('supervised_only', 'true');
  if (opts?.status) params.set('status', opts.status);
  if (opts?.credit_book) params.set('credit_book', opts.credit_book);
  if (opts?.is_agricultural) params.set('is_agricultural', 'true');
  if (opts?.is_legacy === true) params.set('is_legacy', 'true');
  if (opts?.is_legacy === false) params.set('is_legacy', 'false');
  if (opts?.include_funding_preview) params.set('include_funding_preview', 'true');
  if (opts?.legacy_queue) params.set('legacy_queue', opts.legacy_queue);
  if (opts?.has_balance === true) params.set('has_balance', 'true');
  if (opts?.has_balance === false) params.set('has_balance', 'false');
  const res = await api.get<ApiLoansPage | ApiLoan[]>(`/loans/?${params.toString()}`, token);
  if (Array.isArray(res)) {
    return { data: res, total: res.length, page: 1, size: res.length || limit, pages: 1 };
  }
  const data = res?.data ?? [];
  return {
    data,
    total: res?.total ?? data.length,
    page: res?.page ?? 1,
    size: res?.size ?? limit,
    pages: res?.pages ?? Math.max(1, Math.ceil((res?.total ?? data.length) / limit)),
    credit_book: res?.credit_book ?? opts?.credit_book ?? null,
    book_totals: res?.book_totals,
  };
  });
}

/** CIO supervised portfolio clients (`GET /staff/cio/portfolio-clients`). */
export async function apiGetCioPortfolioClients(
  token: string,
  opts?: {
    branch_id?: number;
    page?: number;
    limit?: number;
    search?: string;
    include_inactive?: boolean;
    only_inactive?: boolean;
    has_active_loan?: boolean;
    include_drafts?: boolean;
    unassigned_only?: boolean;
  }
): Promise<ApiClientsPaginated> {
  const limit = opts?.limit ?? 20;
  const page = opts?.page ?? 1;
  const skip = (page - 1) * limit;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('skip', String(skip));
  if (opts?.branch_id != null) params.set('branch_id', String(opts.branch_id));
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  if (opts?.include_inactive === false) params.set('include_inactive', 'false');
  if (opts?.only_inactive) params.set('only_inactive', 'true');
  if (opts?.has_active_loan) params.set('has_active_loan', 'true');
  if (opts?.include_drafts) params.set('include_drafts', 'true');
  if (opts?.unassigned_only) params.set('unassigned_only', 'true');
  const res = await api.get<{ items: ApiClient[]; total: number; skip?: number; limit?: number }>(
    `/staff/cio/portfolio-clients?${params.toString()}`,
    token
  );
  const items = (res?.items ?? []).map(clientToRow);
  return {
    items,
    total: res?.total ?? items.length,
    page,
    pages: Math.max(1, Math.ceil((res?.total ?? items.length) / limit)),
  };
}

/** Staff: loans for one client (`GET /loans/client/{client_id}/loans`). */
export async function apiGetClientLoans(token: string, clientId: number): Promise<ApiLoan[]> {
  const res = await api.get<ApiLoan[] | { data?: ApiLoan[] }>(
    `/loans/client/${clientId}/loans`,
    token
  );
  if (Array.isArray(res)) return res;
  return res?.data ?? [];
}

export async function apiGetLoanSchedule(token: string, loanId: number): Promise<ApiScheduleItem[]> {
  const res = await api.get<ApiScheduleItem[]>(`/loans/${loanId}/schedule`, token);
  return res ?? [];
}

export async function apiGenerateLoanSchedule(token: string, loanId: number): Promise<ApiScheduleItem[]> {
  const res = await api.post<ApiScheduleItem[]>(`/loans/${loanId}/schedule/generate`, {}, token);
  return res ?? [];
}

export type ApiLoanAssignmentOfficer = {
  id: number;
  full_name?: string | null;
  employee_id?: string | null;
  branch_id?: number | null;
  email?: string | null;
  assigned_legacy_count?: number;
};

export type ApiLoanAssignmentSummary = {
  id?: number;
  loan_account_number?: string | null;
  client_id?: number | null;
  client_name?: string | null;
  branch_id?: number | null;
  status?: string | null;
  principal_amount?: number | null;
  outstanding_principal?: number | null;
  outstanding_interest?: number | null;
  next_due_date?: string | null;
  days_in_arrears?: number;
  first_disbursement_date?: string | null;
  is_legacy?: boolean;
  legacy_classification?: string | null;
  legacy_booking_status?: string | null;
  loan_officer_id?: number | null;
  loan_officer_name?: string | null;
  assigned_at?: string | null;
};

export type ApiLegacyAssignmentPage = {
  items?: ApiLoanAssignmentSummary[];
  total?: number;
  skip?: number;
  limit?: number;
};

function withAssignmentQuery(
  url: string,
  opts?: { branchId?: number; search?: string; status?: string; skip?: number; limit?: number; officerId?: number }
): string {
  const q: string[] = [];
  if (opts?.officerId != null) q.push(`officer_id=${opts.officerId}`);
  if (opts?.branchId != null) q.push(`branch_id=${opts.branchId}`);
  if (opts?.search) q.push(`search=${encodeURIComponent(opts.search)}`);
  if (opts?.status) q.push(`status=${encodeURIComponent(opts.status)}`);
  if (opts?.skip != null) q.push(`skip=${opts.skip}`);
  if (opts?.limit != null) q.push(`limit=${opts.limit}`);
  return q.length ? `${url}?${q.join('&')}` : url;
}

export async function apiGetLoanAssignmentOfficers(
  token: string,
  opts?: { branchId?: number }
): Promise<ApiLoanAssignmentOfficer[]> {
  const res = await api.get<ApiLoanAssignmentOfficer[]>(
    withAssignmentQuery(config.loans.loanAssignmentOfficers, opts),
    token
  );
  return res ?? [];
}

export async function apiGetLegacyUnassignedLoans(
  token: string,
  opts?: { branchId?: number; search?: string; status?: string; skip?: number; limit?: number }
): Promise<ApiLegacyAssignmentPage> {
  const res = await api.get<ApiLegacyAssignmentPage>(
    withAssignmentQuery(config.loans.legacyUnassignedAssignments, opts),
    token
  );
  return res ?? { items: [], total: 0 };
}

export async function apiGetLegacyAssignedLoans(
  token: string,
  officerId: number,
  opts?: { branchId?: number; skip?: number; limit?: number }
): Promise<ApiLegacyAssignmentPage> {
  const res = await api.get<ApiLegacyAssignmentPage>(
    withAssignmentQuery(config.loans.legacyAssignedAssignments(officerId), opts),
    token
  );
  return res ?? { items: [], total: 0 };
}

export async function apiAssignLegacyLoanOfficer(
  token: string,
  loanId: number,
  officerId: number,
  reason?: string
): Promise<ApiLoanAssignmentSummary> {
  return api.post<ApiLoanAssignmentSummary>(
    config.loans.assignLegacyLoanOfficer(loanId),
    { officer_id: officerId, reason: reason ?? '' },
    token
  );
}

export async function apiUnassignLegacyLoanOfficer(
  token: string,
  loanId: number,
  reason?: string
): Promise<ApiLoanAssignmentSummary> {
  return api.delete<ApiLoanAssignmentSummary>(
    config.loans.assignLegacyLoanOfficer(loanId),
    token,
    { reason: reason ?? '' }
  );
}

export async function apiGetLoanRepayments(token: string, loanId: number): Promise<ApiRepayment[]> {
  const res = await api.get<ApiRepayment[]>(`/loans/${loanId}/repayments`, token);
  return res ?? [];
}

export async function apiGetCustomerPaymentSchedules(token: string): Promise<unknown[]> {
  return wrapWithPerf('apiGetCustomerPaymentSchedules', async () => {
    const res = await api.get<unknown[]>(config.customer.paymentSchedules, token);
    return res ?? [];
  });
}

/** Client-scoped repayment history */
export async function apiGetCustomerRepayments(token: string, limit?: number): Promise<ApiRepayment[]> {
  return wrapWithPerf('apiGetCustomerRepayments', async () => {
  const url = limit ? `${config.customer.repayments}?limit=${limit}` : config.customer.repayments;
  const res = await api.get<Array<Record<string, unknown>>>(url, token);
  return (res ?? []).map((r) => ({
    id: r.id as number,
    loan_id: r.loan_id as number,
    loan_account_number: (r.loan_account_number as string) ?? '',
    total_amount: (r.amount as number) ?? (r.total_amount as number),
    amount: (r.amount as number) ?? (r.total_amount as number),
    principal_amount: (r.principal_amount as number) ?? 0,
    interest_amount: (r.interest_amount as number) ?? 0,
    penalty_amount: (r.penalty_amount as number) ?? 0,
    repayment_date: typeof r.repayment_date === 'string' ? r.repayment_date : '',
    status: (r.status as string) ?? undefined,
    internal_status: (r.internal_status as string) ?? undefined,
    lifecycle_state: (r.lifecycle_state as string) ?? undefined,
    payment_method: (r.payment_method as string) ?? undefined,
    deposit_receipt_number:
      (r.deposit_receipt_number as string) ?? (r.reference_number as string) ?? null,
    reference_number: (r.reference_number as string) ?? null,
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
    repayment_schema_version: (r.repayment_schema_version as string) ?? undefined,
    member_contributions: Array.isArray(r.member_contributions)
      ? (r.member_contributions as Array<{ member_client_id: number; amount: number }>)
      : undefined,
    member_contribution_details: Array.isArray(r.member_contribution_details)
      ? (r.member_contribution_details as Array<{
          member_client_id: number;
          amount: number;
          member_full_name?: string | null;
        }>)
      : undefined,
  }));
  });
}

/** Portal parity: repayment lifecycle timeline for a borrower payment. */
export async function apiGetCustomerRepaymentLifecycle(
  token: string,
  repaymentId: number
): Promise<ApiRepaymentLifecycleResponse> {
  const res = await api.get<ApiRepaymentLifecycleResponse>(
    config.customer.repaymentLifecycle(repaymentId),
    token
  );
  return {
    events: Array.isArray(res?.events) ? res.events : [],
    lifecycle_state: res?.lifecycle_state ?? null,
  };
}

/** Portal parity: update a draft / pre-post repayment. */
export async function apiUpdateCustomerRepaymentDraft(
  token: string,
  data: {
    repayment_id: number;
    amount_minor?: number;
    payment_method?: string;
    deposit_receipt_number?: string;
    payment_date?: string;
    reason?: string;
  }
): Promise<void> {
  await api.put(config.customer.repaymentsDraft, data, token);
}

/** Portal parity: delete a draft / pre-post repayment. */
export async function apiDeleteCustomerRepaymentDraft(
  token: string,
  data: { repayment_id: number; reason: string }
): Promise<void> {
  await api.delete(config.customer.repaymentsDraft, token, data);
}

/**
 * Default mobile borrower repayment (POST /mobile/repayments).
 * Same LoanRepaymentService pipeline as staff; stays pending until ops confirm.
 */
export async function apiCreateMobileRepayment(
  token: string,
  data: {
    loan_id: number;
    total_amount: number;
    payment_method?: string;
    reference_number?: string;
    allocation_preference?: string;
    selected_installment_ids?: number[];
    member_contributions?: Array<{ member_client_id: number; amount: number }>;
  }
): Promise<ApiRepayment> {
  const res = await api.post<Record<string, unknown>>(config.mobile.repayments, {
    loan_id: data.loan_id,
    total_amount: data.total_amount,
    payment_method: data.payment_method ?? 'MOBILE_APP',
    reference_number: data.reference_number,
    allocation_preference: data.allocation_preference,
    selected_installment_ids: data.selected_installment_ids,
    member_contributions: data.member_contributions,
  }, token);
  return {
    id: Number(res.id),
    loan_id: Number(res.loan_id ?? data.loan_id),
    loan_account_number: String(res.loan_account_number ?? ''),
    total_amount: Number(res.total_amount ?? res.amount ?? data.total_amount),
    amount: Number(res.amount ?? res.total_amount ?? data.total_amount),
    principal_amount: Number(res.principal_amount ?? 0),
    interest_amount: Number(res.interest_amount ?? 0),
    penalty_amount: Number(res.penalty_amount ?? 0),
    repayment_date:
      typeof res.repayment_date === 'string'
        ? res.repayment_date
        : new Date().toISOString().slice(0, 10),
    status: typeof res.status === 'string' ? res.status : 'PENDING',
    internal_status: typeof res.internal_status === 'string' ? res.internal_status : undefined,
  };
}

/**
 * Borrower portal deposit-style repayment (POST /customer/repayments).
 * Prefer apiCreateMobileRepayment for the in-app Custom path.
 */
export async function apiCreateCustomerRepayment(
  token: string,
  data: {
    loan_id: number;
    amount_minor: number;
    payment_method?: string;
    deposit_receipt_number?: string;
    deposit_receipt_url?: string;
    reference_number?: string;
    payment_date?: string;
    selected_installment_ids?: number[];
    installment_allocation_plan?: Record<string, unknown> | null;
    recorded_by_member_id?: number;
  }
): Promise<ApiRepayment> {
  const body: Record<string, unknown> = {
    loan_id: data.loan_id,
    amount_minor: data.amount_minor,
    payment_method: data.payment_method ?? 'CLIENT_DIRECT_DEPOSIT',
    deposit_receipt_number: data.deposit_receipt_number ?? data.reference_number,
    reference_number: data.reference_number ?? data.deposit_receipt_number,
    payment_date: data.payment_date,
    selected_installment_ids: data.selected_installment_ids,
  };
  if (data.deposit_receipt_url) body.deposit_receipt_url = data.deposit_receipt_url;
  if (data.installment_allocation_plan != null) {
    body.installment_allocation_plan = data.installment_allocation_plan;
  }
  if (data.recorded_by_member_id != null && data.recorded_by_member_id > 0) {
    body.recorded_by_member_id = data.recorded_by_member_id;
  }
  const res = await api.post<Record<string, unknown>>(config.customer.repayments, body, token);
  return {
    id: Number(res.id),
    loan_id: Number(res.loan_id ?? data.loan_id),
    loan_account_number: String(res.loan_account_number ?? ''),
    total_amount: Number(res.total_amount ?? res.amount ?? data.amount_minor),
    amount: Number(res.amount ?? res.total_amount ?? data.amount_minor),
    principal_amount: Number(res.principal_amount ?? 0),
    interest_amount: Number(res.interest_amount ?? 0),
    penalty_amount: Number(res.penalty_amount ?? 0),
    repayment_date:
      typeof res.repayment_date === 'string'
        ? res.repayment_date
        : new Date().toISOString().slice(0, 10),
    status: typeof res.status === 'string' ? res.status : 'PENDING',
    internal_status: typeof res.internal_status === 'string' ? res.internal_status : undefined,
  };
}

export type PendingCustomerPayment = {
  id: number;
  loan_id: number;
  total_amount?: number;
  amount_minor?: number;
  payment_method?: string | null;
  status?: string | null;
  internal_status?: string | null;
  lifecycle_state?: string | null;
  reference_number?: string | null;
  deposit_receipt_number?: string | null;
  payment_date?: string | null;
  repayment_date?: string | null;
  created_at?: string | null;
};

export async function apiGetPendingCustomerPayments(
  token: string
): Promise<PendingCustomerPayment[]> {
  const res = await api.get<
    PendingCustomerPayment[] | { pending_payments?: PendingCustomerPayment[]; count?: number }
  >(config.customer.pendingPayments, token);
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.pending_payments)) return res.pending_payments;
  return [];
}

export type InstallmentSelectionRow = {
  id: number;
  loan_id?: number;
  installment_number: number;
  due_date?: string | null;
  principal_amount?: number;
  interest_amount?: number;
  penalty_amount?: number;
  total_amount?: number;
  paid_amount?: number;
  remaining_amount?: number;
  remaining_principal?: number;
  remaining_interest?: number;
  status?: string | null;
  schedule_status?: string | null;
};

export type InstallmentSelectionOptions = {
  default_installment: InstallmentSelectionRow | null;
  overdue_installments: InstallmentSelectionRow[];
  partially_paid_installments: InstallmentSelectionRow[];
  all_unpaid_installments: InstallmentSelectionRow[];
};

export type {
  InstallmentAllocationPlan,
} from '@/lib/loan-origination/installment-allocation';
export { buildInstallmentAllocationPlan } from '@/lib/loan-origination/installment-allocation';

export async function apiGetCustomerInstallmentSelection(
  token: string,
  loanId: number
): Promise<InstallmentSelectionOptions> {
  const res = await api.get<
    InstallmentSelectionOptions | InstallmentSelectionRow[] | { installments?: InstallmentSelectionRow[] }
  >(config.customer.installmentSelection(loanId), token);

  if (Array.isArray(res)) {
    return {
      default_installment: res[0] ?? null,
      overdue_installments: [],
      partially_paid_installments: [],
      all_unpaid_installments: res,
    };
  }
  if (res && Array.isArray((res as { installments?: InstallmentSelectionRow[] }).installments)) {
    const rows = (res as { installments: InstallmentSelectionRow[] }).installments;
    return {
      default_installment: rows[0] ?? null,
      overdue_installments: [],
      partially_paid_installments: [],
      all_unpaid_installments: rows,
    };
  }
  const typed = res as InstallmentSelectionOptions;
  return {
    default_installment: typed?.default_installment ?? null,
    overdue_installments: Array.isArray(typed?.overdue_installments) ? typed.overdue_installments : [],
    partially_paid_installments: Array.isArray(typed?.partially_paid_installments)
      ? typed.partially_paid_installments
      : [],
    all_unpaid_installments: Array.isArray(typed?.all_unpaid_installments)
      ? typed.all_unpaid_installments
      : [],
  };
}

/** Register push token for client or staff */
export async function apiRegisterPushToken(authToken: string, pushToken: string, platform?: string): Promise<void> {
  await api.post(config.device.pushToken, { push_token: pushToken, platform: platform ?? 'expo' }, authToken);
}

// ─── Customer portal (client profile & settings) ─────────────────────────────

export type ApiCustomerSettings = {
  email_notifications?: boolean;
  sms_notifications?: boolean;
  push_notifications?: boolean;
  repayment_reminders_enabled?: boolean;
  application_updates_enabled?: boolean;
};

export async function apiGetCustomerSettings(token: string): Promise<ApiCustomerSettings> {
  const res = await api.get<ApiCustomerSettings>(config.customer.settings, token);
  return res ?? {};
}

export async function apiPutCustomerSettings(token: string, settings: ApiCustomerSettings): Promise<void> {
  await api.put(config.customer.settings, settings, token);
}

export type ApiCustomerProfile = {
  client_id: number;
  /** CRM public client code (e.g. CLI-…) */
  customer_number?: string;
  client_code?: string;
  client_type?: string;
  full_name: string;
  email?: string;
  phone_number?: string;
  address?: string;
  national_id?: string;
  occupation?: string;
  monthly_income?: number;
  profile_photo_url?: string;
  id_document_url?: string;
  gender?: string;
  date_of_birth?: string;
  marital_status?: string;
  employer?: string;
  organization_name?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relationship?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  bank_name?: string;
  bank_branch?: string;
};

export type ApiCustomerProfileUpdate = {
  full_name?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  national_id?: string;
  occupation?: string;
  monthly_income?: number;
  profile_photo_base64?: string;
  id_document_base64?: string;
};

export async function apiGetCustomerProfile(token: string): Promise<ApiCustomerProfile> {
  const res = await api.get<ApiCustomerProfile>(config.customer.profile, token);
  if (!res) throw new Error('Failed to fetch profile');
  return res;
}

export async function apiPutCustomerProfile(
  token: string,
  data: ApiCustomerProfileUpdate
): Promise<void> {
  await api.put(config.customer.profile, data, token);
}

// ─── Staff digest preferences ───────────────────────────────────────────────

export type ApiStaffDigestPrefs = {
  daily_digest_enabled?: boolean;
  digest_time?: string;
  digest_channels?: string[];
};

export async function apiGetStaffDigestPreferences(token: string): Promise<ApiStaffDigestPrefs> {
  const res = await api.get<ApiStaffDigestPrefs>(config.staff.digestPreferences, token);
  return res ?? {};
}

export async function apiPutStaffDigestPreferences(token: string, prefs: ApiStaffDigestPrefs): Promise<void> {
  await api.put(config.staff.digestPreferences, prefs, token);
}

// ─── Repayments ────────────────────────────────────────────────────────────

export async function apiGetDueToday(
  token: string,
  opts?: { search?: string; skip?: number; limit?: number }
): Promise<ApiRepaymentOverviewItem[]> {
  return wrapWithPerf('apiGetDueToday', async () => {
    const params = new URLSearchParams();
    params.set('limit', String(opts?.limit ?? 200));
    if (opts?.skip != null) params.set('skip', String(opts.skip));
    if (opts?.search?.trim()) params.set('search', opts.search.trim());
    const res = await api.get<PaginatedDataEnvelope<ApiRepaymentOverviewItem>>(
      `${config.repayments.dueToday}?${params.toString()}`,
      token
    );
    return unwrapDataList(res);
  });
}

export async function apiGetOverdue(
  token: string,
  opts?: { search?: string; skip?: number; limit?: number }
): Promise<ApiRepaymentOverviewItem[]> {
  return wrapWithPerf('apiGetOverdue', async () => {
    const params = new URLSearchParams();
    params.set('limit', String(opts?.limit ?? 200));
    if (opts?.skip != null) params.set('skip', String(opts.skip));
    if (opts?.search?.trim()) params.set('search', opts.search.trim());
    const res = await api.get<PaginatedDataEnvelope<ApiRepaymentOverviewItem>>(
      `${config.repayments.overdue}?${params.toString()}`,
      token
    );
    return unwrapDataList(res);
  });
}

export async function apiGetLegacyRepaymentBook(
  token: string,
  opts?: {
    creditBook?: 'SME' | 'GROUP' | 'AGRICULTURAL';
    search?: string;
    skip?: number;
    limit?: number;
  }
): Promise<ApiLegacyRepaymentBookPage> {
  return wrapWithPerf('apiGetLegacyRepaymentBook', async () => {
    const params = new URLSearchParams();
    params.set('credit_book', opts?.creditBook ?? 'SME');
    params.set('limit', String(opts?.limit ?? 200));
    if (opts?.skip != null) params.set('skip', String(opts.skip));
    if (opts?.search?.trim()) params.set('search', opts.search.trim());
    const res = await api.get<ApiLegacyRepaymentBookPage>(
      `${config.repayments.legacyBook}?${params.toString()}`,
      token
    );
    if (!res) {
      return { data: [], total: 0, page: 1, size: opts?.limit ?? 200, pages: 1 };
    }
    if (Array.isArray(res)) {
      return {
        data: res,
        total: res.length,
        page: 1,
        size: res.length,
        pages: 1,
        credit_book: opts?.creditBook ?? 'SME',
      };
    }
    const data = unwrapDataList(res);
    return {
      data,
      total: res.total ?? data.length,
      page: res.page ?? 1,
      size: res.size ?? (opts?.limit ?? 200),
      pages: res.pages ?? 1,
      credit_book: res.credit_book ?? opts?.creditBook ?? 'SME',
      book_totals: res.book_totals,
    };
  });
}

export type ApiStartLegacyTrackingResult = {
  status: string;
  loan_id: number;
  schedules_activated: number;
  already_started: boolean;
  next_due_date: string | null;
  days_in_arrears: number;
};

/**
 * Manually start repayment tracking on a journaled legacy loan (ops roles).
 * Activates the ops-generated schedule with its ORIGINAL due dates, so a
 * late start immediately surfaces missed installments (PAR / delinquency).
 */
export async function apiPostStartLegacyRepaymentTracking(
  token: string,
  loanId: number
): Promise<ApiStartLegacyTrackingResult> {
  return wrapWithPerf('apiPostStartLegacyRepaymentTracking', async () =>
    api.post<ApiStartLegacyTrackingResult>(
      config.staff.operationsOfficerStartLegacyTracking(loanId),
      {},
      token
    )
  );
}

export async function apiPreviewLegacyPreviousRepayments(
  token: string,
  loanId: number,
  amountMinor: number
): Promise<import('@/lib/staff/legacy-previous-repayments').LegacyPreviousRepaymentPreview> {
  return wrapWithPerf('apiPreviewLegacyPreviousRepayments', async () => {
    const params = new URLSearchParams();
    params.set('amount_minor', String(Math.max(0, Math.trunc(amountMinor || 0))));
    return api.get(
      `${config.staff.operationsOfficerPreviousRepaymentsPreview(loanId)}?${params.toString()}`,
      token
    );
  });
}

export async function apiRecordLegacyPreviousRepayments(
  token: string,
  loanId: number,
  body: import('@/lib/staff/legacy-previous-repayments').LegacyPreviousRepaymentBody
): Promise<import('@/lib/staff/legacy-previous-repayments').LegacyPreviousRepaymentResult> {
  return wrapWithPerf('apiRecordLegacyPreviousRepayments', async () =>
    api.post(config.staff.operationsOfficerPreviousRepayments(loanId), body, token)
  );
}

export async function apiGetUpcoming(
  token: string,
  opts?: { search?: string; skip?: number; limit?: number; days?: number }
): Promise<ApiRepaymentOverviewItem[]> {
  return wrapWithPerf('apiGetUpcoming', async () => {
    const params = new URLSearchParams();
    params.set('limit', String(opts?.limit ?? 200));
    params.set('days', String(opts?.days ?? 7));
    if (opts?.skip != null) params.set('skip', String(opts.skip));
    if (opts?.search?.trim()) params.set('search', opts.search.trim());
    const res = await api.get<PaginatedDataEnvelope<ApiRepaymentOverviewItem>>(
      `${config.repayments.upcoming}?${params.toString()}`,
      token
    );
    return unwrapDataList(res);
  });
}

export async function apiGetPortfolioHistory(
  token: string,
  opts?: {
    search?: string;
    page?: number;
    limit?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
    payment_method?: string;
    officer_id?: number;
  }
): Promise<ApiRepayment[]> {
  return wrapWithPerf('apiGetPortfolioHistory', async () => {
    const params = new URLSearchParams();
    params.set('page', String(opts?.page ?? 1));
    params.set('limit', String(opts?.limit ?? 100));
    if (opts?.search?.trim()) params.set('search', opts.search.trim());
    if (opts?.status?.trim()) params.set('status', opts.status.trim());
    if (opts?.date_from?.trim()) params.set('date_from', opts.date_from.trim());
    if (opts?.date_to?.trim()) params.set('date_to', opts.date_to.trim());
    if (opts?.payment_method?.trim()) params.set('payment_method', opts.payment_method.trim());
    if (opts?.officer_id != null) params.set('officer_id', String(opts.officer_id));
    const res = await api.get<PaginatedDataEnvelope<Record<string, unknown>>>(
      `${config.repayments.portfolioHistory}?${params.toString()}`,
      token
    );
    return unwrapDataList(res).map((row) => {
      const total = Number(row.total_amount ?? 0);
      const lifecycle = typeof row.lifecycle_state === 'string' ? row.lifecycle_state : undefined;
      const approval =
        typeof row.manager_approval_status === 'string' ? row.manager_approval_status : undefined;
      const isActive = row.is_active !== false;
      let status = 'COMPLETED';
      if (!isActive) status = 'REVERSED';
      else if (lifecycle === 'PENDING_OPERATIONS_VERIFICATION') {
        status = 'AWAITING_VERIFICATION';
      } else if (
        lifecycle === 'OPERATIONS_VERIFIED' ||
        lifecycle === 'ESCALATED_TO_MANAGER'
      ) {
        status = 'PENDING_CONFIRMATION';
      } else if (lifecycle === 'DRAFT' || approval === 'PENDING') {
        status = 'PENDING';
      } else if (approval === 'APPROVED') {
        status = 'PENDING_CONFIRMATION';
      }
      return {
        id: Number(row.id),
        loan_id: row.loan_id != null ? Number(row.loan_id) : undefined,
        loan_account_number:
          typeof row.loan_account_number === 'string' ? row.loan_account_number : undefined,
        client_id: row.client_id != null ? Number(row.client_id) : undefined,
        client_name: typeof row.client_name === 'string' ? row.client_name : undefined,
        total_amount: total,
        amount: total,
        principal_amount: row.principal_amount != null ? Number(row.principal_amount) : undefined,
        interest_amount: row.interest_amount != null ? Number(row.interest_amount) : undefined,
        penalty_amount: row.penalty_amount != null ? Number(row.penalty_amount) : undefined,
        repayment_date:
          typeof row.repayment_date === 'string' ? row.repayment_date.slice(0, 10) : '',
        status,
        internal_status: status,
        lifecycle_state: lifecycle,
        manager_approval_status: approval,
        payment_method: typeof row.payment_method === 'string' ? row.payment_method : undefined,
        reference_number:
          typeof row.reference_number === 'string' ? row.reference_number : null,
        member_contributions: Array.isArray(row.member_contributions)
          ? (row.member_contributions as ApiRepayment['member_contributions'])
          : undefined,
        sync_status: 'synced' as const,
      } satisfies ApiRepayment;
    });
  });
}

export async function apiCreateRepayment(
  token: string,
  loanId: number,
  clientId: number,
  amount: number,
  principalAmount: number,
  interestAmount: number,
  memberContributions?: Array<{ member_client_id: number; amount: number }>,
  clientReference?: string
): Promise<ApiRepayment> {
  const body = {
    loan_id: loanId,
    client_id: clientId,
    principal_amount: principalAmount,
    interest_amount: interestAmount,
    penalty_amount: 0,
    total_amount: amount,
    payment_method: 'MOBILE_APP',
    member_contributions: memberContributions,
    // F7: idempotency key — backend returns the existing repayment on a repeat
    // (loan_id, client_reference) instead of double-posting to the ledger.
    client_reference: clientReference,
  };
  return api.post<ApiRepayment>(`${config.apiBase}/loans/repayments`, body, token);
}

// ─── Staff ─────────────────────────────────────────────────────────────────

export async function apiGetDigest(token: string): Promise<ApiStaffDigest | null> {
  const res = await api.get<ApiStaffDigest>(config.staff.digest, token);
  return res ?? null;
}

/** LO personal book dashboard (GET /staff/loan-officer/dashboard). */
export type ApiLoanOfficerRecentApplication = {
  application_id: number;
  client_name: string;
  amount: number;
  status: string;
  submitted_at?: string | null;
};

export type ApiLoanOfficerUpcomingRepayment = {
  loan_id: number;
  client_name: string;
  amount_due?: number | null;
  due_date?: string | null;
};

export type ApiLoanOfficerDashboard = {
  total_active_loans: number;
  total_pending_applications: number;
  total_arrears_loans: number;
  portfolio_value: number;
  upcoming_repayments_count: number;
  active_clients: number;
  active_groups: number;
  pending_approval_repayments: number;
  awaiting_verification_repayments: number;
  overdue_repayments: number;
  serviced_today_repayments: number;
  pending_collateral_reviews: number;
  locked_collateral_total: number;
  collateral_insufficiency_alerts: number;
  pending_loan_approvals: number;
  pending_disbursements: number;
  pending_group_reviews: number;
  pending_repayment_verifications: number;
  recent_registrations: number;
  recent_deposits: number;
  recent_transfers: number;
  unread_notifications: number;
  high_priority_notifications: number;
  pending_group_repayments: number;
  group_arrears_loans: number;
  /** Repayment-engine PAR snapshot (same shape as BMS dashboard). */
  repayment_par_health?: Record<string, unknown> | null;
  credit_book?: string | null;
  credit_book_label?: string | null;
  recent_applications?: ApiLoanOfficerRecentApplication[];
  upcoming_repayments?: ApiLoanOfficerUpcomingRepayment[];
};

export async function apiGetLoanOfficerDashboard(
  token: string
): Promise<ApiLoanOfficerDashboard | null> {
  const res = await api.get<ApiLoanOfficerDashboard>(config.staff.loanOfficerDashboard, token);
  return res ?? null;
}

export type ApiCioOfficerStat = {
  officer_id: number;
  officer_name: string;
  active_loans: number;
  pending_loans: number;
  arrears_loans: number;
  portfolio_value: number;
};

export type ApiCioDashboard = {
  supervised_officers_count: number;
  total_active_loans: number;
  total_pending_loans: number;
  total_arrears_loans: number;
  total_portfolio_value: number;
  par_percentage?: number;
  officer_stats?: ApiCioOfficerStat[];
  repayment_par_health?: Record<string, unknown> | null;
  credit_book?: string | null;
  credit_book_label?: string | null;
  loan_officers_optional?: boolean;
  self_originating?: boolean;
};

export type ApiCioLoanOfficer = {
  id: number;
  full_name: string;
  email?: string | null;
  role?: string | null;
};

export async function apiGetCioDashboard(token: string): Promise<ApiCioDashboard | null> {
  const res = await api.get<ApiCioDashboard>(config.staff.cioDashboard, token);
  return res ?? null;
}

export type ApiCreditBookCounts = {
  sme: number;
  group: number;
  agricultural: number;
  total: number;
  is_legacy?: boolean | null;
};

/** Full-book CIO supervised aggregates (`GET /staff/cio/supervised-portfolio-analytics`). */
export type ApiCioSupervisedPortfolioAnalytics = {
  product_breakdown: Array<{
    loan_product_id: number;
    product_name: string;
    total_loans: number;
    total_principal_minor: number;
    outstanding_principal_minor: number;
    total_repaid_minor: number;
    default_count: number;
    par30_outstanding_minor: number;
  }>;
  portfolio_rollups: {
    total_loans: number;
    total_principal_minor: number;
    total_outstanding_principal_minor: number;
    total_repaid_minor: number;
    active_loans: number;
    delinquent_loans: number;
    default_loans: number;
  };
};

/** A supervised loan row (`GET /staff/cio/supervised-loans/v2`). */
export type ApiSupervisedLoan = {
  id: number;
  loan_id: string;
  client_name: string;
  loan_officer_id: number;
  loan_officer_name: string;
  /** Approved amount (minor units). */
  amount: number;
  principal_amount?: number;
  disbursed_amount?: number;
  outstanding_principal?: number;
  outstanding_interest?: number;
  outstanding_balance: number;
  status: string;
  arrears_days: number | null;
  product_name: string;
  branch_id?: number | null;
  branch_name?: string | null;
  term_months?: number | null;
  interest_rate_bps?: number | null;
  next_due_date?: string | null;
  days_until_repayment?: number | null;
  days_until_next_repayment?: number | null;
  repayment_tracking_live?: boolean;
  application_origination_stage?: string | null;
  disbursement_date: string | null;
  maturity_date?: string | null;
  created_date?: string;
};

export type ApiCioSupervisedLoansV2 = {
  total: number;
  skip: number;
  limit: number;
  loans: ApiSupervisedLoan[];
  aggregations: {
    total_active_loans: number;
    total_pending_loans: number;
    total_arrears_loans: number;
    total_portfolio_value: number;
    total_outstanding_balance: number;
    par_percentage: number;
    officer_breakdown: Record<
      number,
      {
        officer_name: string;
        total_loans: number;
        active_loans: number;
        pending_loans: number;
        arrears_loans: number;
        portfolio_value: number;
        outstanding_balance: number;
      }
    >;
  };
};

/** SME / Group book counts plus the agricultural subcategory (`GET /loans/credit-book-counts`). */
export async function apiGetCreditBookCounts(
  token: string,
  opts?: {
    branch_id?: number;
    assigned_only?: boolean;
    supervised_only?: boolean;
    status?: string;
    is_legacy?: boolean;
  }
): Promise<ApiCreditBookCounts> {
  const params = new URLSearchParams();
  if (opts?.branch_id != null) params.set('branch_id', String(opts.branch_id));
  if (opts?.assigned_only) params.set('assigned_only', 'true');
  if (opts?.supervised_only) params.set('supervised_only', 'true');
  if (opts?.status) params.set('status', opts.status);
  if (opts?.is_legacy === true) params.set('is_legacy', 'true');
  if (opts?.is_legacy === false) params.set('is_legacy', 'false');
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get<ApiCreditBookCounts>(`${config.staff.creditBookCounts}${query}`, token);
  return res ?? { sme: 0, group: 0, agricultural: 0, total: 0, is_legacy: null };
}

export async function apiGetCioSupervisedPortfolioAnalytics(
  token: string,
  branchId?: number
): Promise<ApiCioSupervisedPortfolioAnalytics | null> {
  const params = new URLSearchParams();
  if (branchId != null) params.set('branch_id', String(branchId));
  const qs = params.toString();
  const res = await api.get<ApiCioSupervisedPortfolioAnalytics>(
    `${config.staff.cioSupervisedPortfolioAnalytics}${qs ? `?${qs}` : ''}`,
    token
  );
  return res ?? null;
}

/** Optimized CIO supervised loans (`GET /staff/cio/supervised-loans/v2`). */
export async function apiGetCioSupervisedLoansV2(
  token: string,
  opts?: {
    skip?: number;
    limit?: number;
    branch_id?: number;
    use_cache?: boolean;
    disbursed_booked_only?: boolean;
    loan_officer_id?: number;
  }
): Promise<ApiCioSupervisedLoansV2> {
  const params = new URLSearchParams({
    skip: String(opts?.skip ?? 0),
    limit: String(opts?.limit ?? 100),
    use_cache: String(opts?.use_cache ?? true),
  });
  if (opts?.branch_id != null) params.set('branch_id', String(opts.branch_id));
  if (opts?.disbursed_booked_only) params.set('disbursed_booked_only', 'true');
  if (opts?.loan_officer_id != null) params.set('loan_officer_id', String(opts.loan_officer_id));
  const res = await api.get<ApiCioSupervisedLoansV2>(
    `${config.staff.cioSupervisedLoansV2}?${params.toString()}`,
    token
  );
  return res ?? { total: 0, skip: 0, limit: 0, loans: [], aggregations: {} as ApiCioSupervisedLoansV2['aggregations'] };
}

/** Record that a CIO opened the application review screen (`POST /loans/applications/{id}/cio-review-opened`). */
export async function apiNotifyCioReviewOpened(
  token: string,
  applicationId: number
): Promise<{ status: string; detail: string } | null> {
  const res = await api.post<{ status: string; detail: string }>(
    `/loans/applications/${applicationId}/cio-review-opened`,
    {},
    token
  );
  return res ?? null;
}

export async function apiGetCioLoanOfficers(token: string): Promise<ApiCioLoanOfficer[]> {
  const res = await api.get<ApiCioLoanOfficer[] | { items?: ApiCioLoanOfficer[] }>(
    config.staff.cioLoanOfficers,
    token
  );
  if (Array.isArray(res)) return res;
  return res?.items ?? [];
}

export type RoleQueueApplication = {
  id: number;
  application_number?: string | null;
  client_name?: string | null;
  product_name?: string | null;
  status?: string | null;
  origination_stage?: string | null;
  requested_amount?: number | null;
  approved_amount?: number | null;
  loan_id?: number | null;
  origination_return_reason?: string | null;
};

export type RoleApplicationPage = {
  total: number;
  skip: number;
  limit: number;
  items: RoleQueueApplication[];
};

export type ApiPortfolioManagerDashboard = {
  branch_id?: number;
  with_portfolio_manager_review_count?: number;
  pending_disbursement_count?: number;
  missing_approval_record_count?: number;
  with_ceo_review_count?: number;
  with_gceo_review_count?: number;
  with_cio_initial_review_count?: number;
  repayment_handoff_pending_count?: number;
  active_loan_count?: number;
  total_outstanding_principal_minor?: number;
  total_outstanding_interest_minor?: number;
  repayment_par_health?: Record<string, unknown> | null;
};

export type ApiDrawdownPipelineRow = {
  application_id: number;
  application_number?: string | null;
  client_name?: string | null;
  product_name?: string | null;
  status?: string | null;
  origination_stage?: string | null;
  open_drawdown_count?: number;
  needs_drawdown_attention?: boolean;
  optional_drawdown_slot?: boolean;
  origination_return_reason?: string | null;
};

export type ApiDrawdownPipelinePage = {
  total: number;
  skip: number;
  limit: number;
  items: ApiDrawdownPipelineRow[];
};

export type ApiLoanDrawdownTranche = {
  index?: number;
  amount_minor: number;
  scheduled_date?: string | null;
  condition?: string | null;
  disbursed_minor?: number;
  disbursement_ids?: number[];
};

export type ApiLoanDrawdown = {
  id: number;
  loan_application_id?: number | null;
  loan_id?: number | null;
  branch_id?: number | null;
  ld_number?: string | null;
  contract_number?: string | null;
  status?: string | null;
  beneficiary?: Record<string, unknown> | null;
  draw_tranches?: ApiLoanDrawdownTranche[] | null;
  verification_attested_at?: string | null;
  pdf_generation_status?: string | null;
  contract_pdf_document_id?: number | null;
};

export type ApiLoanDrawdownEnvelope = {
  success?: boolean;
  drawdown?: ApiLoanDrawdown;
};

export type ApiKycBeneficiary = {
  application_id: number;
  client_id?: number | null;
  beneficiary?: Record<string, unknown> | null;
  has_payee?: boolean;
};

export type ApiLoanDrawdownCreateBody = {
  draw_tranches?: Array<{
    amount_minor: number;
    scheduled_date?: string | null;
    condition?: string | null;
  }>;
  beneficiary?: Record<string, unknown> | null;
  import_from_legacy_draw_plan?: boolean;
};

export type ApiLoanDrawdownUpdateBody = {
  draw_tranches?: Array<{
    amount_minor: number;
    scheduled_date?: string | null;
    condition?: string | null;
  }>;
  beneficiary?: Record<string, unknown> | null;
};

export type ApiSchedulePreviewInstallment = {
  installment_number?: number;
  due_date?: string | null;
  principal_amount?: number;
  interest_amount?: number;
  total_amount?: number;
  remaining_principal_after?: number;
  row_type?: string | null;
  row_kind?: string | null;
};

export type ApiSchedulePreviewResponse = {
  application_id?: number;
  principal_minor?: number;
  term_months?: number;
  interest_rate_bps?: number;
  amortization_type?: string | null;
  interest_calculation_method?: string | null;
  repayment_frequency?: string | null;
  installment_count?: number;
  installments?: ApiSchedulePreviewInstallment[] | null;
  schedule_structure?: string | null;
  moratorium_periods_applied?: number;
  cash_payment_uniformity?: string | null;
  min_installment_total_minor?: number;
  max_installment_total_minor?: number;
  total_interest_minor?: number;
  total_principal_scheduled_minor?: number;
  total_scheduled_due_minor?: number;
  principal_remaining_after_schedule_minor?: number;
  typical_installment_minor?: number;
  preview_warnings?: string[] | null;
  strategy_token?: string | null;
  is_seasonal_preview?: boolean;
  preview_note?: string | null;
};

export async function apiGetApplicationSchedulePreview(
  token: string,
  applicationId: number
): Promise<ApiSchedulePreviewResponse | null> {
  const res = await api.get<ApiSchedulePreviewResponse>(
    config.loans.schedulePreview(applicationId),
    token
  );
  return res ?? null;
}

function withPageQuery(path: string, opts?: { skip?: number; limit?: number }): string {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  return q.toString() ? `${path}?${q}` : path;
}

export async function apiGetPortfolioManagerDashboard(
  token: string
): Promise<ApiPortfolioManagerDashboard | null> {
  return wrapWithPerf('apiGetPortfolioManagerDashboard', async () => {
    const res = await api.get<ApiPortfolioManagerDashboard>(
      config.staff.portfolioManagerDashboard,
      token
    );
    return res ?? null;
  });
}

export async function apiGetPortfolioManagerQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.portfolioManagerPmQueue, opts),
    token
  );
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export async function apiGetPortfolioManagerCioBacklog(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.portfolioManagerCioBacklog, opts),
    token
  );
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export async function apiGetPortfolioManagerExecutivePipeline(
  token: string,
  opts?: { skip?: number; limit?: number; stage?: 'ceo' | 'gceo' }
): Promise<RoleApplicationPage> {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.stage) q.set('stage', opts.stage);
  const url = `${config.staff.portfolioManagerExecutivePipeline}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<RoleApplicationPage>(url, token);
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export async function apiGetPortfolioManagerHandoffQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.portfolioManagerHandoffQueue, opts),
    token
  );
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export async function apiGetPortfolioManagerDrawdownPipeline(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiDrawdownPipelinePage> {
  const res = await api.get<ApiDrawdownPipelinePage>(
    withPageQuery(config.staff.portfolioManagerDrawdownPipeline, opts),
    token
  );
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

function unwrapDrawdown(payload: ApiLoanDrawdownEnvelope | ApiLoanDrawdown | null | undefined): ApiLoanDrawdown {
  if (payload && typeof payload === 'object' && 'drawdown' in payload && payload.drawdown) {
    return payload.drawdown;
  }
  if (payload && typeof payload === 'object' && 'id' in payload) {
    return payload as ApiLoanDrawdown;
  }
  throw new Error('Drawdown response was empty.');
}

export async function apiListLoanDrawdowns(
  token: string,
  applicationId: number
): Promise<ApiLoanDrawdown[]> {
  const res = await api.get<ApiLoanDrawdown[] | { items?: ApiLoanDrawdown[] }>(
    config.staff.portfolioManagerLoanDrawdowns(applicationId),
    token
  );
  if (Array.isArray(res)) return res;
  return res?.items ?? [];
}

export async function apiCreateLoanDrawdown(
  token: string,
  applicationId: number,
  body?: ApiLoanDrawdownCreateBody
): Promise<ApiLoanDrawdown> {
  const res = await api.post<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerLoanDrawdowns(applicationId),
    {
      draw_tranches: body?.draw_tranches ?? [],
      import_from_legacy_draw_plan: body?.import_from_legacy_draw_plan ?? true,
      ...(body?.beneficiary ? { beneficiary: body.beneficiary } : {}),
    },
    token
  );
  return unwrapDrawdown(res);
}

export async function apiUpdateLoanDrawdown(
  token: string,
  applicationId: number,
  drawdownId: number,
  body: ApiLoanDrawdownUpdateBody
): Promise<ApiLoanDrawdown> {
  const res = await api.patch<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerLoanDrawdown(applicationId, drawdownId),
    body,
    token
  );
  return unwrapDrawdown(res);
}

export async function apiGetApplicationKycBeneficiary(
  token: string,
  applicationId: number
): Promise<ApiKycBeneficiary> {
  const res = await api.get<ApiKycBeneficiary>(
    config.staff.portfolioManagerKycBeneficiary(applicationId),
    token
  );
  return {
    application_id: res?.application_id ?? applicationId,
    client_id: res?.client_id ?? null,
    beneficiary: res?.beneficiary ?? {},
    has_payee: Boolean(res?.has_payee),
  };
}

export async function apiRefreshLoanDrawdownBeneficiary(
  token: string,
  applicationId: number,
  drawdownId: number
): Promise<ApiLoanDrawdown> {
  const res = await api.post<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerRefreshDrawdownBeneficiary(applicationId, drawdownId),
    {},
    token
  );
  return unwrapDrawdown(res);
}

export async function apiAttestLoanDrawdown(
  token: string,
  drawdownId: number,
  body?: {
    loan_details_verified?: boolean;
    beneficiary_verified?: boolean;
    schedule_verified?: boolean;
  }
): Promise<ApiLoanDrawdown> {
  const res = await api.post<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerDrawdownAttest(drawdownId),
    {
      loan_details_verified: body?.loan_details_verified ?? true,
      beneficiary_verified: body?.beneficiary_verified ?? true,
      schedule_verified: body?.schedule_verified ?? true,
    },
    token
  );
  return unwrapDrawdown(res);
}

export async function apiApproveLoanDrawdown(
  token: string,
  applicationId: number,
  drawdownId: number,
  body?: { approval_notes?: string; allocation_id?: number | null }
): Promise<ApiLoanDrawdown> {
  const res = await api.post<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerLoanDrawdownApprove(applicationId, drawdownId),
    {
      approval_notes: body?.approval_notes ?? '',
      ...(body?.allocation_id != null ? { allocation_id: body.allocation_id } : {}),
    },
    token
  );
  return unwrapDrawdown(res);
}

export type ApiFundingPool = {
  id: number;
  fund_id?: number | null;
  fund_name?: string | null;
  branch_id?: number | null;
  branch_name?: string | null;
  allocated_amount_minor?: number;
  utilized_minor?: number;
  remaining_minor?: number;
};

/** Active loan_management funding pools for the PM drawdown approve picker. */
export async function apiListPmFundingPools(
  token: string,
  opts?: { branchId?: number; includeUnapproved?: boolean }
): Promise<ApiFundingPool[]> {
  const params = new URLSearchParams();
  if (opts?.branchId != null) params.set('branch_id', String(opts.branchId));
  if (opts?.includeUnapproved) params.set('include_unapproved', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get<ApiFundingPool[]>(
    `${config.staff.portfolioManagerFundingPools}${query}`,
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiCancelLoanDrawdown(
  token: string,
  applicationId: number,
  drawdownId: number,
  reason?: string
): Promise<ApiLoanDrawdown> {
  const res = await api.post<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerLoanDrawdownCancel(applicationId, drawdownId),
    { reason: reason ?? '' },
    token
  );
  return unwrapDrawdown(res);
}

export async function apiDeleteLoanDrawdown(
  token: string,
  applicationId: number,
  drawdownId: number
): Promise<void> {
  await api.delete(
    config.staff.portfolioManagerLoanDrawdown(applicationId, drawdownId),
    token
  );
}

export async function apiRequestDrawdownContractPdf(
  token: string,
  applicationId: number,
  drawdownId: number
): Promise<ApiLoanDrawdown> {
  const res = await api.post<ApiLoanDrawdownEnvelope | ApiLoanDrawdown>(
    config.staff.portfolioManagerLoanDrawdownContractPdf(applicationId, drawdownId),
    {},
    token
  );
  return unwrapDrawdown(res);
}

export type ApiDrawdownContractPdfStatus = {
  drawdown_id: number;
  pdf_generation_status?: string | null;
  pdf_generation_error?: string | null;
  contract_pdf_document_id?: number | null;
};

export async function apiGetDrawdownContractPdfStatus(
  token: string,
  applicationId: number,
  drawdownId: number
): Promise<ApiDrawdownContractPdfStatus> {
  return api.get<ApiDrawdownContractPdfStatus>(
    config.staff.portfolioManagerLoanDrawdownContractPdfStatus(applicationId, drawdownId),
    token
  );
}

export type ApiDrawdownHistoryRow = {
  application_id: number;
  application_number: string;
  client_name?: string | null;
  product_name?: string | null;
  application_status: string;
  origination_stage?: string | null;
  drawdown_row_count: number;
  latest_drawdown_id?: number | null;
  latest_ld_number?: string | null;
  latest_drawdown_status?: string | null;
  last_activity_at?: string | null;
  origination_return_reason?: string | null;
};

export type ApiDrawdownHistoryPage = {
  total: number;
  skip: number;
  limit: number;
  items: ApiDrawdownHistoryRow[];
};

export type ApiDrawdownSettings = {
  letterhead_title?: string | null;
  logo_url?: string | null;
  logo_key?: string | null;
  has_logo?: boolean;
  institution_contact?: string | null;
  repayment_bank_name?: string | null;
  repayment_account_name?: string | null;
  repayment_account_number?: string | null;
  repayment_account_type?: string | null;
  repayment_bank_branch?: string | null;
  repayment_routing_or_swift?: string | null;
  repayment_mobile_money_provider?: string | null;
  repayment_mobile_money_number?: string | null;
  repayment_instructions_template?: string | null;
  footer_note?: string | null;
};

/** Bank-level drawdown branding + repayment template settings (letterhead, logo, footer). */
export async function apiGetDrawdownSettings(token: string): Promise<ApiDrawdownSettings> {
  return api.get<ApiDrawdownSettings>(config.staff.portfolioManagerDrawdownSettings, token);
}

export async function apiUpdateDrawdownSettings(
  token: string,
  body: ApiDrawdownSettings
): Promise<ApiDrawdownSettings> {
  return api.put<ApiDrawdownSettings>(config.staff.portfolioManagerDrawdownSettings, body, token);
}

/** Upload the institution logo used on drawdown letterheads and contract PDFs. */
export async function apiUploadDrawdownLogo(
  token: string,
  file: { uri: string; name: string; mimeType?: string }
): Promise<ApiDrawdownSettings> {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? 'image/png',
  } as unknown as Blob);
  return api.postForm<ApiDrawdownSettings>(
    config.staff.portfolioManagerDrawdownSettingsLogo,
    form,
    token
  );
}

export async function apiDeleteDrawdownLogo(token: string): Promise<ApiDrawdownSettings> {
  return api.delete<ApiDrawdownSettings>(
    config.staff.portfolioManagerDrawdownSettingsLogo,
    token
  );
}

/** Branch drawdown ledger: applications with at least one persisted drawdown. */
export async function apiGetPortfolioManagerDrawdownHistory(
  token: string,
  opts?: { skip?: number; limit?: number; branchId?: number }
): Promise<ApiDrawdownHistoryPage> {
  const params = new URLSearchParams();
  if (opts?.skip != null) params.set('skip', String(opts.skip));
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.branchId != null) params.set('branch_id', String(opts.branchId));
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get<ApiDrawdownHistoryPage>(
    `${config.staff.portfolioManagerDrawdownHistory}${query}`,
    token
  );
  return {
    total: res?.total ?? 0,
    skip: res?.skip ?? 0,
    limit: res?.limit ?? 0,
    items: res?.items ?? [],
  };
}

export type ApiAccountantDashboard = {
  branch_id?: number;
  branch_name?: string | null;
  pending_disbursement_application_count?: number;
  operations_queue_application_count?: number;
  active_loan_count?: number;
  total_outstanding_principal_minor?: number;
  total_outstanding_interest_minor?: number;
  disbursements_mtd_count?: number;
  disbursements_mtd_amount_minor?: number;
  repayments_mtd_count?: number;
  repayments_mtd_amount_minor?: number;
  loans_past_due_30_plus?: number;
  active_loans_in_arrears_count?: number;
  repayment_par_health?: Record<string, unknown> | null;
};

export type ApiAccountantDisbursementRow = {
  id?: number;
  disbursement_id?: number;
  loan_id?: number;
  loan_application_id?: number;
  client_name?: string | null;
  reference_number?: string | null;
  amount_minor?: number | null;
  status?: string | null;
};

export type ApiAccountantJournalLoan = {
  id?: string | number;
  applicationNumber?: string | null;
  application_number?: string | null;
  customerName?: string | null;
  client_name?: string | null;
  productName?: string | null;
  product_name?: string | null;
  originalPrincipalMinor?: number | null;
  outstandingBalanceMinor?: number | null;
  status?: string | null;
  legacyBookingStatus?: string | null;
  certifiedForAccounting?: boolean | null;
  completionStatus?: string | null;
  journalPendingReason?: string | null;
  loan_application_id?: number | null;
  allocationId?: number | null;
  fundingFundId?: number | null;
  fundingFundName?: string | null;
  fundingCreditSource?: string | null;
  investment_assigned?: boolean | null;
  investmentAssigned?: boolean | null;
  repaymentScheduleRows?: number | null;
  repaymentScheduleTotalDueMinor?: number | null;
  nextDueDate?: string | null;
  nextScheduleDueDate?: string | null;
  lastPaymentDate?: string | null;
};

export type ApiAccountantJournalPage = {
  loans?: ApiAccountantJournalLoan[];
  total?: number;
  page?: number;
  pages?: number;
  skip?: number;
  limit?: number;
  credit_book?: string | null;
  book_totals?: { sme?: number; group?: number; agricultural?: number };
  pipeline_counts?: {
    ops_queue?: number;
    awaiting_operations?: number;
    journal_ready?: number;
    certified_not_handed_off?: number;
    already_journaled_with_balance?: number;
  };
};

export async function apiGetAccountantDashboard(
  token: string
): Promise<ApiAccountantDashboard | null> {
  return wrapWithPerf('apiGetAccountantDashboard', async () => {
    const res = await api.get<ApiAccountantDashboard>(config.staff.accountantDashboard, token);
    return res ?? null;
  });
}

export async function apiGetAccountantPendingDisbursement(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.accountantPendingDisbursement, opts),
    token
  );
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export async function apiGetAccountantOperationsQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.accountantOperationsQueue, opts),
    token
  );
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export async function apiGetAccountantRecentDisbursements(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiAccountantDisbursementRow[]> {
  const res = await api.get<ApiAccountantDisbursementRow[]>(
    withPageQuery(config.staff.accountantRecentDisbursements, opts),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiGetAccountantLoanJournals(
  token: string,
  opts?: {
    book?: 'legacy' | 'current' | 'all';
    skip?: number;
    limit?: number;
    credit_book?: string;
    is_agricultural?: boolean;
    queue?: 'active' | 'archive';
  }
): Promise<ApiAccountantJournalPage> {
  const q = new URLSearchParams();
  q.set('book', opts?.book ?? 'all');
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.credit_book) q.set('credit_book', opts.credit_book);
  if (opts?.is_agricultural) q.set('is_agricultural', 'true');
  if (opts?.queue) q.set('queue', opts.queue);
  const res = await api.get<ApiAccountantJournalPage>(
    `${config.staff.accountantLoanJournals}?${q}`,
    token
  );
  return {
    loans: res?.loans ?? [],
    total: res?.total ?? 0,
    page: res?.page,
    pages: res?.pages,
    skip: res?.skip,
    limit: res?.limit,
    credit_book: res?.credit_book ?? opts?.credit_book ?? null,
    book_totals: res?.book_totals,
    pipeline_counts: res?.pipeline_counts,
  };
}

export async function apiPostAccountantReturnForCorrection(
  token: string,
  loanId: number,
  reason: string
): Promise<unknown> {
  return api.post(
    config.staff.accountantReturnLoanForCorrection(loanId),
    { reason },
    token
  );
}

export async function apiPostAccountantGenerateJournals(
  token: string,
  loanId: number
): Promise<unknown> {
  try {
    return await api.post(config.staff.accountantGenerateJournals(loanId), {}, token);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
    return api.post(
      `${config.staff.accountantLegacyBooking}/${loanId}/generate-journal-entries`,
      {},
      token
    );
  }
}

export type ApiAccountantPendingRepayment = {
  repayment_id: number;
  loan_id: number;
  client_id?: number;
  client_name?: string | null;
  loan_account_number?: string | null;
  total_amount_minor: number;
  principal_amount_minor?: number;
  interest_amount_minor?: number;
  penalty_amount_minor?: number;
  repayment_date?: string | null;
  receipt_number?: string | null;
  payment_method?: string | null;
  lifecycle_state?: string | null;
  manager_approval_status?: string | null;
  internal_status?: string | null;
  days_since_approval?: number | null;
};

export type ApiAccountantPendingRepaymentPage = {
  total: number;
  skip: number;
  limit: number;
  items: ApiAccountantPendingRepayment[];
};

export type ApiAccountantFinalizeResult = {
  status?: string;
  detail?: string;
  message?: string;
  finalized_count?: number;
  failed_count?: number;
  total_amount_minor?: number;
  failed_repayments?: Array<{ repayment_id?: number; reason?: string }>;
};

export type ApiRepaymentMetrics = {
  total_repayments?: number;
  total_amount_minor?: number;
  principal_amount_minor?: number;
  interest_amount_minor?: number;
  penalty_amount_minor?: number;
  collection_rate?: number;
  overdue_repayment_count?: number;
  overdue_amount_minor?: number;
  average_repayment_amount_minor?: number;
  repayment_count_by_status?: Record<string, number>;
};

export type ApiPmRepaymentRow = {
  id: number;
  loan_id?: number;
  client_id?: number;
  client_name?: string | null;
  loan_number?: string | null;
  repayment_date?: string | null;
  principal_amount?: number;
  interest_amount?: number;
  penalty_amount?: number;
  total_amount?: number;
  payment_method?: string | null;
  internal_status?: string | null;
  reference_number?: string | null;
  loan_officer_name?: string | null;
  cio_officer_name?: string | null;
};

export async function apiGetAccountantPendingRepayments(
  token: string,
  opts?: { skip?: number; limit?: number; search?: string; status?: string }
): Promise<ApiAccountantPendingRepaymentPage> {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.search?.trim()) q.set('search', opts.search.trim());
  if (opts?.status?.trim()) q.set('status', opts.status.trim());
  const url = `${config.staff.accountantPendingRepayments}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<ApiAccountantPendingRepaymentPage>(url, token);
  return {
    total: res?.total ?? 0,
    skip: res?.skip ?? 0,
    limit: res?.limit ?? 0,
    items: res?.items ?? [],
  };
}

export async function apiPostAccountantFinalizeRepayments(
  token: string,
  repaymentIds: number[],
  notes?: string
): Promise<ApiAccountantFinalizeResult> {
  const res = await api.post<ApiAccountantFinalizeResult>(
    config.staff.accountantFinalizeRepayments,
    { repayment_ids: repaymentIds, notes },
    token
  );
  return res ?? {};
}

export async function apiPostAccountantFinalizeAllRepayments(
  token: string
): Promise<ApiAccountantFinalizeResult> {
  const res = await api.post<ApiAccountantFinalizeResult>(
    config.staff.accountantFinalizeAllRepayments,
    {},
    token
  );
  return res ?? {};
}

export async function apiGetPortfolioManagerRepaymentsList(
  token: string,
  opts?: { skip?: number; limit?: number; search?: string; status?: string }
): Promise<{ items: ApiPmRepaymentRow[]; total: number }> {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.search?.trim()) q.set('search', opts.search.trim());
  if (opts?.status?.trim()) q.set('status', opts.status.trim());
  const url = `${config.staff.portfolioManagerRepaymentsList}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<{ items?: ApiPmRepaymentRow[]; total?: number }>(url, token);
  return {
    items: res?.items ?? (Array.isArray(res) ? (res as ApiPmRepaymentRow[]) : []),
    total: res?.total ?? 0,
  };
}

export async function apiGetPortfolioManagerRepaymentMetrics(
  token: string
): Promise<ApiRepaymentMetrics> {
  const res = await api.get<ApiRepaymentMetrics>(config.staff.portfolioManagerRepaymentsMetrics, token);
  return res ?? {};
}

export async function apiGetCeoRepaymentMetrics(token: string): Promise<ApiRepaymentMetrics> {
  const res = await api.get<ApiRepaymentMetrics>(config.staff.ceoExecutiveMetrics, token);
  return res ?? {};
}

export async function apiGetGceoRepaymentMetrics(token: string): Promise<ApiRepaymentMetrics> {
  const res = await api.get<ApiRepaymentMetrics>(config.staff.gceoStrategicMetrics, token);
  return res ?? {};
}

function asApplicationPage(res: RoleApplicationPage | RoleQueueApplication[] | null | undefined): RoleApplicationPage {
  if (Array.isArray(res)) {
    return { total: res.length, skip: 0, limit: res.length, items: res };
  }
  return { total: res?.total ?? 0, skip: res?.skip ?? 0, limit: res?.limit ?? 0, items: res?.items ?? [] };
}

export type ApiOperationsOfficerDashboard = {
  legacy_booking_count?: number;
  operations_queue_count?: number;
  disbursements_today_count?: number;
  repayments_pending_count?: number;
  penalty_alerts_count?: number;
  insurance_processing_count?: number;
  compliance_pending_count?: number;
  performance_score?: number;
  repayment_par_health?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
  portfolio?: {
    active_loan_count?: number;
    outstanding_principal_minor?: number;
    outstanding_interest_minor?: number;
    repayment_par_health?: Record<string, unknown> | null;
  } | null;
};

export type ApiEscalatedRepaymentRow = {
  id?: number;
  repayment_id?: number;
  loan_id?: number;
  loan_application_id?: number;
  client_name?: string | null;
  receipt_number?: string | null;
  reference?: string | null;
  amount_minor?: number | null;
  total_amount?: number | null;
  amount?: number | null;
  escalation_reason?: string | null;
  reason?: string | null;
  manager_approval_status?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type ApiEscalatedRepaymentPage = {
  items?: ApiEscalatedRepaymentRow[];
  total?: number;
  skip?: number;
  limit?: number;
};

export type ApiDisbursementReviewRow = {
  id?: number;
  disbursement_id?: number;
  loan_id?: number;
  loan_application_id?: number;
  client_name?: string | null;
  disbursement_number?: string | null;
  amount?: number | null;
  amount_minor?: number | null;
  status?: string | null;
  method?: string | null;
  review_note?: string | null;
};

/** One member row inside a grouped pending review (backend `_group_queue_rows`). */
export type ApiPendingReviewMember = ApiDisbursementReviewRow & {
  loan_account_number?: string | null;
  /** Non-empty when the loan file was sent back for update (awaiting resubmission) — approvals locked. */
  origination_return_reason?: string | null;
  needs_origination_update?: boolean;
};

/** Group-first pending-review row (`grouped=true` — one row per loan application). */
export type ApiPendingReviewGroup = {
  application_id: number;
  application_number?: string | null;
  group_id?: number | null;
  group_name?: string | null;
  branch_id?: number | null;
  member_count: number;
  total_amount: number;
  created_at?: string | null;
  /** True when any member's loan file is sent for update — group approvals locked. */
  needs_origination_update?: boolean;
  origination_return_reason?: string | null;
  members: ApiPendingReviewMember[];
};

/** Full review detail for a single disbursement (dashboard `DisbursementReviewDetail` mirror). */
export type ApiReviewDetail = {
  disbursement?: Record<string, unknown>;
  loan?: Record<string, unknown>;
  client?: Record<string, unknown>;
  application?: Record<string, unknown>;
  product?: Record<string, unknown>;
  fees?: Record<string, unknown>;
  registration?: Record<string, unknown>;
  penalties?: Array<Record<string, unknown>>;
  notes?: { application?: unknown[]; loan?: unknown[] };
  collateral?: Array<Record<string, unknown>>;
  guarantors?: Array<Record<string, unknown>>;
};

export type ApiExecutiveRepaymentRow = {
  id?: number;
  repayment_id?: number;
  loan_id?: number;
  client_name?: string | null;
  branch_name?: string | null;
  amount_minor?: number | null;
  total_amount?: number | null;
  amount?: number | null;
  status?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
};

export async function apiGetOperationsOfficerDashboard(
  token: string
): Promise<ApiOperationsOfficerDashboard | null> {
  return wrapWithPerf('apiGetOperationsOfficerDashboard', async () => {
    const res = await api.get<ApiOperationsOfficerDashboard>(
      config.staff.operationsOfficerDashboard,
      token
    );
    return res ?? null;
  });
}

export async function apiGetOperationsOfficerOpsQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage | RoleQueueApplication[]>(
    withPageQuery(config.staff.operationsOfficerOpsQueue, opts),
    token
  );
  return asApplicationPage(res);
}

export async function apiGetOperationsOfficerRecentRepayments(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiEscalatedRepaymentPage> {
  const res = await api.get<ApiEscalatedRepaymentPage>(
    withPageQuery(config.staff.operationsOfficerRecentRepayments, opts),
    token
  );
  return { items: res?.items ?? [], total: res?.total ?? 0, skip: res?.skip, limit: res?.limit };
}

export async function apiPostOperationsOfficerEscalateRepayment(
  token: string,
  repaymentId: number,
  reason: string
): Promise<unknown> {
  return api.post(config.staff.operationsOfficerEscalateRepayment(repaymentId), { reason }, token);
}

export async function apiGetOperationsOfficerRepaymentRecord(
  token: string,
  repaymentId: number
): Promise<OpsRepaymentRecord> {
  return api.get<OpsRepaymentRecord>(config.staff.operationsOfficerRepaymentRecord(repaymentId), token);
}

export async function apiPostOperationsOfficerConfirmBatch(
  token: string,
  repaymentIds: number[]
): Promise<unknown> {
  return api.post(config.staff.operationsOfficerConfirmBatch, { repayment_ids: repaymentIds }, token);
}

export async function apiGetOperationsOfficerQueueDetail(
  token: string,
  applicationId: number
): Promise<OpsOriginationQueueRecord> {
  return api.get<OpsOriginationQueueRecord>(
    config.staff.operationsOfficerQueueDetail(applicationId),
    token
  );
}

export async function apiPostOperationsOfficerProvisionCycle(
  token: string,
  applicationId: number,
  body: {
    grace_period_days?: number;
    first_due_date?: string;
    last_due_date?: string;
    override_term_months?: number;
    skip_first_installments?: number;
  } = {}
): Promise<unknown> {
  return api.post(config.staff.operationsOfficerProvisionCycle(applicationId), body, token);
}

export async function apiGetOperationsManagerDashboard(
  token: string
): Promise<ApiPortfolioManagerDashboard | null> {
  return wrapWithPerf('apiGetOperationsManagerDashboard', async () => {
    const res = await api.get<ApiPortfolioManagerDashboard>(
      config.staff.operationsManagerDashboard,
      token
    );
    return res ?? null;
  });
}

export async function apiGetOperationsManagerOpsQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.operationsManagerOpsQueue, opts),
    token
  );
  return asApplicationPage(res);
}

export async function apiGetOperationsManagerHandoffQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.operationsManagerHandoffQueue, opts),
    token
  );
  return asApplicationPage(res);
}

export async function apiGetOperationsManagerExecutivePipeline(
  token: string,
  opts?: { skip?: number; limit?: number; stage?: 'ceo' | 'gceo' }
): Promise<RoleApplicationPage> {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.stage) q.set('stage', opts.stage);
  const url = `${config.staff.operationsManagerExecutivePipeline}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<RoleApplicationPage>(url, token);
  return asApplicationPage(res);
}

export async function apiGetOperationsManagerEscalatedRepayments(
  token: string,
  opts?: { skip?: number; limit?: number; status?: string; search?: string }
): Promise<ApiEscalatedRepaymentPage> {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.status) q.set('status', opts.status);
  if (opts?.search) q.set('search', opts.search);
  const url = `${config.staff.operationsManagerEscalatedRepayments}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<ApiEscalatedRepaymentPage>(url, token);
  return { items: res?.items ?? [], total: res?.total ?? 0, skip: res?.skip, limit: res?.limit };
}

export async function apiPostOperationsManagerApproveEscalation(
  token: string,
  repaymentId: number,
  approved: boolean,
  rejectionReason?: string
): Promise<unknown> {
  return api.post(config.staff.operationsManagerApproveEscalation(repaymentId), {
    approved,
    rejection_reason: rejectionReason,
  }, token);
}

export async function apiPostOperationsManagerApproveRepayment(
  token: string,
  repaymentId: number,
  approved: boolean,
  rejectionReason?: string
): Promise<unknown> {
  return api.post(config.staff.operationsManagerApproveRepayment(repaymentId), {
    approved,
    rejection_reason: rejectionReason,
  }, token);
}

export async function apiGetOperationsManagerRepaymentRecord(
  token: string,
  repaymentId: number
): Promise<OpsRepaymentRecord> {
  return api.get<OpsRepaymentRecord>(config.staff.operationsManagerRepaymentRecord(repaymentId), token);
}

export async function apiGetOperationsManagerQueueDetail(
  token: string,
  applicationId: number
): Promise<OpsOriginationQueueRecord> {
  return api.get<OpsOriginationQueueRecord>(
    config.staff.operationsManagerQueueDetail(applicationId),
    token
  );
}

export type ApiInvestmentPool = {
  id: number;
  fund_name?: string | null;
  branch_name?: string | null;
  remaining_minor?: number;
  allocated_amount_minor?: number;
  utilized_minor?: number;
  approval_status?: string | null;
};

export type ApiAccountantFundingPool = ApiInvestmentPool;

export type ApiAssignInvestmentPoolResult = {
  loan_id: number;
  application_id?: number | null;
  allocation_id: number;
  investment_assigned?: boolean;
  funding_fund_id?: number | null;
  funding_fund_name?: string | null;
  fundingFundName?: string | null;
  funding_credit_source?: string | null;
  drawdown_recorded_minor?: number;
  repayments_attributed?: number;
};

export type ApiAccountantAttachFundingPoolResult = {
  loan_id?: number;
  application_id?: number;
  allocation_id?: number | null;
  fundingFundName?: string | null;
  funding_fund_name?: string | null;
};

export async function apiGetInvestmentPools(
  token: string,
  opts?: { include_unapproved?: boolean }
): Promise<ApiInvestmentPool[]> {
  const path =
    opts?.include_unapproved
      ? `${config.loans.investmentPools}?include_unapproved=true`
      : config.loans.investmentPools;
  const res = await api.get<ApiInvestmentPool[]>(path, token);
  return Array.isArray(res) ? res : [];
}

export async function apiPostAssignInvestmentPool(
  token: string,
  loanId: number,
  allocationId: number
): Promise<ApiAssignInvestmentPoolResult> {
  const res = await api.post<ApiAssignInvestmentPoolResult>(
    config.loans.assignInvestmentPool(loanId),
    { allocation_id: allocationId },
    token
  );
  return res ?? { loan_id: loanId, allocation_id: allocationId, investment_assigned: true };
}

export async function apiGetAccountantFundingPools(
  token: string
): Promise<ApiAccountantFundingPool[]> {
  const res = await api.get<ApiAccountantFundingPool[]>(config.staff.accountantFundingPools, token);
  return Array.isArray(res) ? res : [];
}

export async function apiPostAccountantAttachLoanFundingPool(
  token: string,
  loanId: number,
  allocationId: number
): Promise<ApiAccountantAttachFundingPoolResult> {
  const res = await api.post<ApiAccountantAttachFundingPoolResult>(
    config.staff.accountantAttachLoanFundingPool(loanId),
    { allocation_id: allocationId },
    token
  );
  return res ?? {};
}

export async function apiPostAccountantAttachApplicationFundingPool(
  token: string,
  applicationId: number,
  allocationId: number
): Promise<ApiAccountantAttachFundingPoolResult> {
  const res = await api.post<ApiAccountantAttachFundingPoolResult>(
    config.staff.accountantAttachApplicationFundingPool(applicationId),
    { allocation_id: allocationId },
    token
  );
  return res ?? {};
}

export async function apiGetOperationsAssistantPendingReview(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiDisbursementReviewRow[]> {
  const res = await api.get<ApiDisbursementReviewRow[]>(
    withPageQuery(config.staff.operationsAssistantPendingReview, opts),
    token
  );
  return Array.isArray(res) ? res : [];
}

/** Group-first pending review — one row per loan application with embedded `members[]`. */
export async function apiGetOperationsAssistantPendingReviewGrouped(
  token: string,
  opts?: { branchId?: number; skip?: number; limit?: number }
): Promise<ApiPendingReviewGroup[]> {
  const q = new URLSearchParams();
  q.set('grouped', 'true');
  if (opts?.branchId != null) q.set('branch_id', String(opts.branchId));
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  const res = await api.get<ApiPendingReviewGroup[]>(
    `${config.staff.operationsAssistantPendingReview}?${q.toString()}`,
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiGetOperationsAssistantReviewDetail(
  token: string,
  disbursementId: number
): Promise<ApiReviewDetail | null> {
  const res = await api.get<ApiReviewDetail>(config.staff.operationsAssistantReviewDetail(disbursementId), token);
  return res ?? null;
}

export async function apiPostOperationsAssistantReviewApprove(
  token: string,
  disbursementId: number
): Promise<unknown> {
  return api.post(config.staff.operationsAssistantReviewApprove(disbursementId), {}, token);
}

export async function apiPostOperationsAssistantReviewReturn(
  token: string,
  disbursementId: number,
  note: string
): Promise<unknown> {
  return api.post(config.staff.operationsAssistantReviewReturn(disbursementId), { note }, token);
}

export async function apiGetCeoDashboard(token: string): Promise<ApiPortfolioManagerDashboard | null> {
  return wrapWithPerf('apiGetCeoDashboard', async () => {
    const res = await api.get<ApiPortfolioManagerDashboard>(config.staff.ceoDashboard, token);
    return res ?? null;
  });
}

export async function apiGetCeoQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(withPageQuery(config.staff.ceoQueue, opts), token);
  return asApplicationPage(res);
}

export async function apiGetCeoGceoEscalations(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.ceoGceoEscalations, opts),
    token
  );
  return asApplicationPage(res);
}

export async function apiGetCeoRepaymentsList(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<{ items: ApiExecutiveRepaymentRow[]; total: number }> {
  const res = await api.get<{ items?: ApiExecutiveRepaymentRow[]; total?: number }>(
    withPageQuery(config.staff.ceoRepaymentsList, opts),
    token
  );
  return { items: res?.items ?? (Array.isArray(res) ? (res as ApiExecutiveRepaymentRow[]) : []), total: res?.total ?? 0 };
}

export async function apiGetGceoDashboard(token: string): Promise<ApiPortfolioManagerDashboard | null> {
  return wrapWithPerf('apiGetGceoDashboard', async () => {
    const res = await api.get<ApiPortfolioManagerDashboard>(config.staff.gceoDashboard, token);
    return res ?? null;
  });
}

export async function apiGetGceoQueue(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(withPageQuery(config.staff.gceoQueue, opts), token);
  return asApplicationPage(res);
}

export async function apiGetGceoCeoPipeline(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<RoleApplicationPage> {
  const res = await api.get<RoleApplicationPage>(
    withPageQuery(config.staff.gceoCeoPipeline, opts),
    token
  );
  return asApplicationPage(res);
}

export async function apiGetGceoRepaymentsList(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<{ items: ApiExecutiveRepaymentRow[]; total: number }> {
  const res = await api.get<{ items?: ApiExecutiveRepaymentRow[]; total?: number }>(
    withPageQuery(config.staff.gceoRepaymentsList, opts),
    token
  );
  return { items: res?.items ?? (Array.isArray(res) ? (res as ApiExecutiveRepaymentRow[]) : []), total: res?.total ?? 0 };
}

export async function apiGetPendingDisbursementReleases(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiDisbursementReviewRow[]> {
  const res = await api.get<ApiDisbursementReviewRow[]>(
    withPageQuery(config.staff.pendingDisbursementRelease, opts),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiPostApproveDisbursementRelease(
  token: string,
  disbursementId: number
): Promise<unknown> {
  return api.post(config.staff.approveDisbursementRelease(disbursementId), {}, token);
}

export async function apiPostRejectDisbursementRelease(
  token: string,
  disbursementId: number,
  reason: string
): Promise<unknown> {
  return api.post(config.staff.rejectDisbursementRelease(disbursementId), { reason }, token);
}

/** Origination status for an application (readiness + pipeline context). */
export type ApiOriginationStatus = {
  application_id: number;
  status?: string | null;
  origination_stage?: string | null;
  origination_return_reason?: string | null;
  suggested_origination_actions?: string[];
  needs_missing_approval_record?: boolean;
  next_step?: string | null;
  pending_release_disbursement_count?: number;
  pending_review_disbursement_ids?: number[];
  pending_release_disbursement_ids?: number[];
  unreleased_disbursement_ids?: number[];
  booked_loan_ids?: number[];
  collateral_complete?: boolean;
  guarantor_complete?: boolean;
  ready_to_submit?: boolean;
  blockers?: string[];
  blocker_details?: string[];
};

export async function apiGetOriginationStatus(
  token: string,
  applicationId: number
): Promise<OriginationStatus | null> {
  const res = await api.get<OriginationStatus>(config.staff.originationStatus(applicationId), token);
  return res ?? null;
}

export async function apiPostOriginationTransition(
  token: string,
  applicationId: number,
  body: LoanOriginationTransitionBody
): Promise<ApiApp> {
  return api.post<ApiApp>(config.staff.originationTransition(applicationId), body, token);
}

export async function apiPostOriginationRecordMissingApproval(
  token: string,
  applicationId: number
): Promise<unknown> {
  return api.post(config.staff.originationRecordMissingApproval(applicationId), {}, token);
}

/** CEO desk: release every unreleased disbursement on the application in one step. */
export async function apiPostCeoReleaseApplication(
  token: string,
  applicationId: number
): Promise<unknown> {
  return api.post(config.staff.ceoReleaseApplication(applicationId), {}, token);
}

/** CEO send-back to a specific prior desk (LO / CIO / PM / accountant / OA). */
export async function apiPostCeoClarificationReturn(
  token: string,
  applicationId: number,
  body: { target_level: string; note: string }
): Promise<unknown> {
  return api.post(config.staff.ceoClarificationReturn(applicationId), body, token);
}

export type ApiRepaymentHandoffLoanItem = {
  loan_id?: number;
  loan_account_number?: string;
  client_name?: string;
  status?: string;
  principal_minor?: number;
  outstanding_principal_minor?: number;
  outstanding_interest_minor?: number;
  first_disbursement_date?: string | null;
  installment_count?: number;
  next_due_date?: string | null;
  next_due_amount?: number | null;
  installments?: Array<Record<string, unknown>>;
};

export type ApiRepaymentHandoffDetail = {
  application?: Record<string, unknown> | null;
  stage?: string | null;
  client?: {
    id?: number;
    client_number?: string;
    name?: string;
    phone_number?: string | null;
    email?: string | null;
    client_type?: string | null;
    organization_name?: string | null;
    member_count?: number;
    is_group?: boolean;
  } | null;
  branch?: { id?: number; name?: string } | null;
  loans?: ApiRepaymentHandoffLoanItem[];
  members?: Array<Record<string, unknown>>;
  member_total_minor?: number;
  totals?: Record<string, unknown>;
  actions?: { can_acknowledge?: boolean };
};

export async function apiGetRepaymentHandoffDetail(
  token: string,
  applicationId: number
): Promise<ApiRepaymentHandoffDetail | null> {
  const res = await api.get<ApiRepaymentHandoffDetail>(
    config.staff.repaymentHandoffDetail(applicationId),
    token
  );
  return res ?? null;
}

export type ApiInvestmentFund = {
  id: number;
  fund_name?: string;
  fund_code?: string;
  fund_type?: string;
  status?: string;
  currency?: string;
  target_size_cents?: number;
  total_committed_cents?: number;
  total_paid_in_cents?: number;
  total_called_cents?: number;
  remaining_capital_cents?: number;
  deployment_rate?: number | null;
  inception_date?: string;
  description?: string | null;
};

export type ApiInvestmentFundList = {
  funds?: ApiInvestmentFund[];
  total?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
};

export type ApiFundStatistics = {
  total_funds?: number;
  total_aum_cents?: number;
  active_funds?: number;
  raising_funds?: number;
  avg_deployment_rate?: number;
  total_committed_cents?: number;
  total_deployed_cents?: number;
};

export type ApiShareholder = {
  id: number;
  name?: string;
  shareholder_type?: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  contact_person?: string | null;
  total_commitment_cents?: number;
  total_invested_cents?: number;
  num_investments?: number;
};

export type ApiShareholderList = {
  shareholders?: ApiShareholder[];
  total?: number;
};

export type ApiShareholderStatistics = {
  total_shareholders?: number;
  individual_count?: number;
  institutional_count?: number;
  government_count?: number;
  corporate_count?: number;
  total_capital_committed_cents?: number;
  avg_commitment_per_shareholder_cents?: number;
};

export type ApiShareholderInvestment = {
  id: number;
  shareholder_id?: number;
  fund_id?: number;
  investment_type?: string;
  commitment_amount_cents?: number;
  called_amount_cents?: number;
  unpaid_commitment_cents?: number;
  current_value_cents?: number;
  distributed_amount_cents?: number;
  roi_percent?: number | null;
  investment_date?: string;
  shareholder_name?: string | null;
  fund_name?: string | null;
  fund_code?: string | null;
  approval_status?: string;
  is_ceo_locked?: boolean;
};

export type ApiShareholderInvestmentList = {
  investments?: ApiShareholderInvestment[];
  total?: number;
};

export type ApiShareholderInvestmentStatistics = {
  total_investments?: number;
  total_commitment_cents?: number;
  total_called_cents?: number;
  total_unpaid_cents?: number;
  total_current_value_cents?: number;
  total_distributed_cents?: number;
  avg_roi_percent?: number;
  num_active_investments?: number;
};

export type ApiInvestmentAllocation = {
  id: number;
  fund_id?: number | null;
  fund_name?: string | null;
  scope?: string;
  service_type?: string;
  branch_id?: number | null;
  branch_name?: string | null;
  allocated_amount_minor?: number;
  utilized_minor?: number;
  remaining_minor?: number;
  returned_principal_minor?: number;
  profit_interest_minor?: number;
  is_active?: boolean;
  notes?: string | null;
};

export type ApiInvestmentAllocationSummary = {
  total_committed_minor?: number;
  total_paid_in_minor?: number;
  total_deployable_minor?: number;
  capacity_basis?: string;
  total_allocated_minor?: number;
  total_utilized_minor?: number;
  total_remaining_minor?: number;
  total_unallocated_minor?: number;
  active_allocation_count?: number;
};

function unwrapNamedList<T>(
  res: T[] | Record<string, unknown> | null | undefined,
  key: string
): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  const list = res[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

export async function apiGetInvestmentFunds(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiInvestmentFund[]> {
  const res = await api.get<ApiInvestmentFundList | ApiInvestmentFund[]>(
    withPageQuery(config.investment.funds, opts),
    token
  );
  return unwrapNamedList<ApiInvestmentFund>(res, 'funds');
}

export async function apiGetInvestmentFundStats(token: string): Promise<ApiFundStatistics | null> {
  const res = await api.get<ApiFundStatistics>(config.investment.fundStats, token);
  return res ?? null;
}

export async function apiGetInvestmentShareholders(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiShareholder[]> {
  const res = await api.get<ApiShareholderList | ApiShareholder[]>(
    withPageQuery(config.investment.shareholders, opts),
    token
  );
  return unwrapNamedList<ApiShareholder>(res, 'shareholders');
}

export async function apiGetInvestmentShareholderStats(
  token: string
): Promise<ApiShareholderStatistics | null> {
  const res = await api.get<ApiShareholderStatistics>(config.investment.shareholderStats, token);
  return res ?? null;
}

export async function apiGetInvestmentSubscriptions(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiShareholderInvestment[]> {
  const res = await api.get<ApiShareholderInvestmentList | ApiShareholderInvestment[]>(
    withPageQuery(config.investment.investments, opts),
    token
  );
  return unwrapNamedList<ApiShareholderInvestment>(res, 'investments');
}

export async function apiGetInvestmentSubscriptionStats(
  token: string
): Promise<ApiShareholderInvestmentStatistics | null> {
  const res = await api.get<ApiShareholderInvestmentStatistics>(
    config.investment.investmentStats,
    token
  );
  return res ?? null;
}

export async function apiPostApproveInvestmentSubscription(
  token: string,
  investmentId: number
): Promise<ApiShareholderInvestment | null> {
  const res = await api.post<ApiShareholderInvestment>(
    config.investment.investmentApprove(investmentId),
    {},
    token
  );
  return res ?? null;
}

export async function apiPostRejectInvestmentSubscription(
  token: string,
  investmentId: number
): Promise<ApiShareholderInvestment | null> {
  const res = await api.post<ApiShareholderInvestment>(
    config.investment.investmentReject(investmentId),
    {},
    token
  );
  return res ?? null;
}

export async function apiGetInvestmentAllocations(
  token: string,
  opts?: { skip?: number; limit?: number }
): Promise<ApiInvestmentAllocation[]> {
  const res = await api.get<ApiInvestmentAllocation[]>(
    withPageQuery(config.investment.allocations, opts),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiGetInvestmentAllocationSummary(
  token: string
): Promise<ApiInvestmentAllocationSummary | null> {
  const res = await api.get<ApiInvestmentAllocationSummary>(
    config.investment.allocationSummary,
    token
  );
  return res ?? null;
}

export async function apiAssignClientToStaff(
  token: string,
  clientId: number,
  staffId: number | null
): Promise<void> {
  const qs = staffId == null ? '' : `?staff_id=${staffId}`;
  await api.patch(`/clients/${clientId}/assign${qs}`, {}, token);
}

// ─── LO / CIO CRB report management ──────────────────────────────────────────

export type ApiCrbReportType =
  | 'NEW_CLIENTS_CRB'
  | 'EXISTING_CLIENTS_CRB'
  | 'ACTIVE_LOANS_CRB'
  | 'PORTFOLIO_CRB';
export type ApiCrbFormatType = 'STANDARD' | 'CRB_STANDARD' | 'CRB_ENHANCED';
export type ApiCrbCreditBook = 'ALL' | 'SME' | 'GROUP';
export type ApiCrbWorkflowChannel = 'LO_CIO' | 'OPS_OM';

export type ApiCrbScopeDescriptor = {
  mode?: string | null;
  label?: string | null;
  channel?: string | null;
  branch_id?: number | null;
  loan_officer_id?: number | null;
  officer_ids?: number[];
  client_id?: number | null;
  loan_id?: number | null;
  credit_book?: ApiCrbCreditBook | string | null;
};

export type ApiCrbPortfolioOfficer = {
  id: number;
  full_name: string;
  email?: string | null;
  branch_id?: number | null;
  role?: string | null;
};

export type ApiCrbActorContext = {
  role: string;
  channel: string;
  scope_mode: string;
  label: string;
  can_generate: boolean;
  can_review: boolean;
  branch_id?: number | null;
  officer_ids: number[];
  officers: ApiCrbPortfolioOfficer[];
};

export type ApiCrbReportSummary = {
  id: number;
  report_type: string;
  format_type?: string;
  title: string;
  status: string;
  period_from?: string | null;
  period_to?: string | null;
  generated_by_id?: number | null;
  generated_by_name?: string | null;
  loan_officer_id?: number | null;
  loan_officer_name?: string | null;
  forwarded_to_cio_id?: number | null;
  forwarded_to_cio_name?: string | null;
  forward_message?: string | null;
  cio_notes?: string | null;
  summary?: Record<string, unknown> | null;
  scope?: ApiCrbScopeDescriptor | null;
  scope_mode?: string | null;
  scope_label?: string | null;
  client_id?: number | null;
  loan_id?: number | null;
  generated_at?: string | null;
  forwarded_at?: string | null;
  reviewed_at?: string | null;
};

export type ApiCrbReportDetail = ApiCrbReportSummary & {
  payload: Record<string, unknown>;
};

export type ApiCrbCioOption = {
  id: number;
  full_name: string;
  email?: string | null;
  branch_id?: number | null;
  is_supervisor?: boolean;
};

export type ApiCrbManagerOption = {
  id: number;
  full_name: string;
  email?: string | null;
  branch_id?: number | null;
  is_supervisor?: boolean;
};

export async function apiListCrbReports(
  token: string,
  opts?: {
    inbox_only?: boolean;
    mine_only?: boolean;
    workflow_channel?: string;
    status?: string;
    search?: string;
    report_type?: string;
    period_from?: string;
    period_to?: string;
    generated_from?: string;
    generated_to?: string;
    limit?: number;
  }
): Promise<{ items: ApiCrbReportSummary[]; total: number }> {
  const q = new URLSearchParams();
  if (opts?.inbox_only) q.set('inbox_only', 'true');
  if (opts?.mine_only) q.set('mine_only', 'true');
  if (opts?.workflow_channel) q.set('workflow_channel', opts.workflow_channel);
  if (opts?.status) q.set('status', opts.status);
  if (opts?.search?.trim()) q.set('search', opts.search.trim());
  if (opts?.report_type) q.set('report_type', opts.report_type);
  if (opts?.period_from) q.set('period_from', opts.period_from);
  if (opts?.period_to) q.set('period_to', opts.period_to);
  if (opts?.generated_from) q.set('generated_from', opts.generated_from);
  if (opts?.generated_to) q.set('generated_to', opts.generated_to);
  if (opts?.limit) q.set('limit', String(opts.limit));
  const url = `${config.crbReports.list}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<{ items: ApiCrbReportSummary[]; total: number }>(url, token);
  return { items: res?.items ?? [], total: res?.total ?? 0 };
}

/** Smoke-check whether the CRB management router is deployed. */
export async function apiCrbReportsHealth(): Promise<boolean> {
  try {
    const res = await api.get<{ ok?: boolean }>(config.crbReports.health);
    return res?.ok === true;
  } catch {
    return false;
  }
}

export async function apiGenerateCrbReport(
  token: string,
  body: {
    report_type: ApiCrbReportType;
    date_from?: string;
    date_to?: string;
    format_type?: ApiCrbFormatType;
    include_paid_loans?: boolean;
    title?: string;
    loan_officer_id?: number;
    client_id?: number;
    loan_id?: number;
    workflow_channel?: ApiCrbWorkflowChannel;
    credit_book?: ApiCrbCreditBook;
  }
): Promise<ApiCrbReportDetail> {
  const res = await api.post<ApiCrbReportDetail>(config.crbReports.generate, body, token);
  if (!res?.id) throw new Error('CRB report generation failed');
  return res;
}

export async function apiGetCrbContext(token: string): Promise<ApiCrbActorContext | null> {
  const res = await api.get<ApiCrbActorContext>(config.crbReports.context, token);
  return res?.role ? res : null;
}

export async function apiListCrbPortfolioOfficers(token: string): Promise<ApiCrbPortfolioOfficer[]> {
  const res = await api.get<ApiCrbPortfolioOfficer[]>(config.crbReports.portfolioOfficers, token);
  return Array.isArray(res) ? res : [];
}

export async function apiListCrbCios(token: string): Promise<ApiCrbCioOption[]> {
  const res = await api.get<ApiCrbCioOption[]>(config.crbReports.cios, token);
  return Array.isArray(res) ? res : [];
}

export async function apiListCrbManagers(token: string): Promise<ApiCrbManagerOption[]> {
  const res = await api.get<ApiCrbManagerOption[]>(config.crbReports.managers, token);
  return Array.isArray(res) ? res : [];
}

export async function apiGetCrbReport(token: string, id: number): Promise<ApiCrbReportDetail> {
  const res = await api.get<ApiCrbReportDetail>(config.crbReports.detail(id), token);
  if (!res?.id) throw new Error('CRB report not found');
  return res;
}

export async function apiForwardCrbReport(
  token: string,
  id: number,
  body: { to_cio_id: number; message?: string }
): Promise<ApiCrbReportDetail> {
  const res = await api.post<ApiCrbReportDetail>(config.crbReports.forward(id), body, token);
  if (!res?.id) throw new Error('Failed to forward CRB report');
  return res;
}

export async function apiSubmitCrbReportToManager(
  token: string,
  id: number,
  body: { to_manager_id: number; message?: string }
): Promise<ApiCrbReportDetail> {
  const res = await api.post<ApiCrbReportDetail>(config.crbReports.submitToManager(id), body, token);
  if (!res?.id) throw new Error('Failed to submit CRB report to the operations manager');
  return res;
}

export async function apiAcknowledgeCrbReport(
  token: string,
  id: number,
  notes?: string
): Promise<ApiCrbReportDetail> {
  const res = await api.post<ApiCrbReportDetail>(
    config.crbReports.acknowledge(id),
    { notes },
    token
  );
  if (!res?.id) throw new Error('Failed to acknowledge CRB report');
  return res;
}

export async function apiReturnCrbReport(
  token: string,
  id: number,
  notes: string
): Promise<ApiCrbReportDetail> {
  const res = await api.post<ApiCrbReportDetail>(
    config.crbReports.returnToOfficer(id),
    { notes },
    token
  );
  if (!res?.id) throw new Error('Failed to return CRB report');
  return res;
}

/* ── Unified managed staff reports ─────────────────────────────────────── */

export type ApiStaffReportCatalogItem = {
  key: string;
  name: string;
  category: string;
  description: string;
  generator_roles?: string[];
  default_forward_roles: string[];
  allowed_forward_roles: string[];
  export_formats?: string[];
};

export type ApiManagedStaffReportRecipient = {
  id: number;
  to_role: string;
  to_staff_id?: number | null;
  to_staff_name?: string | null;
  status: string;
  notes?: string | null;
  forwarded_at?: string | null;
  reviewed_at?: string | null;
};

export type ApiManagedStaffReport = {
  id: number;
  bank_id?: number;
  branch_id?: number | null;
  catalog_key: string;
  category: string;
  title: string;
  export_format?: string;
  status: string;
  priority?: string;
  period_from?: string | null;
  period_to?: string | null;
  summary?: Record<string, unknown> | null;
  generated_by_id?: number | null;
  generated_by_name?: string | null;
  generated_by_role?: string | null;
  forward_message?: string | null;
  generated_at?: string | null;
  forwarded_at?: string | null;
  recipient_count?: number;
  pending_recipient_count?: number;
  recipients?: ApiManagedStaffReportRecipient[];
  parameters?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  report_storage_id?: number | null;
};

export type ApiStaffReportDashboard = {
  generated_count: number;
  forwarded_count: number;
  inbox_pending_count: number;
  acknowledged_count: number;
  returned_count: number;
  recent_mine: ApiManagedStaffReport[];
  recent_inbox: ApiManagedStaffReport[];
  catalog_count: number;
};

export async function apiStaffReportCatalog(
  token: string
): Promise<{ items: ApiStaffReportCatalogItem[]; role: string }> {
  const res = await api.get<{ items: ApiStaffReportCatalogItem[]; role: string }>(
    config.staffReports.catalog,
    token
  );
  return { items: res?.items ?? [], role: res?.role ?? '' };
}

export async function apiStaffReportDashboard(
  token: string
): Promise<ApiStaffReportDashboard> {
  const res = await api.get<ApiStaffReportDashboard>(config.staffReports.dashboard, token);
  return {
    generated_count: res?.generated_count ?? 0,
    forwarded_count: res?.forwarded_count ?? 0,
    inbox_pending_count: res?.inbox_pending_count ?? 0,
    acknowledged_count: res?.acknowledged_count ?? 0,
    returned_count: res?.returned_count ?? 0,
    recent_mine: Array.isArray(res?.recent_mine) ? res.recent_mine : [],
    recent_inbox: Array.isArray(res?.recent_inbox) ? res.recent_inbox : [],
    catalog_count: res?.catalog_count ?? 0,
  };
}

export async function apiListStaffReports(
  token: string,
  opts?: {
    inbox_only?: boolean;
    mine_only?: boolean;
    catalog_key?: string;
    status?: string;
    limit?: number;
  }
): Promise<{ items: ApiManagedStaffReport[]; total: number }> {
  const q = new URLSearchParams();
  if (opts?.inbox_only) q.set('inbox_only', 'true');
  if (opts?.mine_only) q.set('mine_only', 'true');
  if (opts?.catalog_key) q.set('catalog_key', opts.catalog_key);
  if (opts?.status) q.set('status', opts.status);
  if (opts?.limit) q.set('limit', String(opts.limit));
  const url = `${config.staffReports.list}${q.toString() ? `?${q}` : ''}`;
  const res = await api.get<{ items: ApiManagedStaffReport[]; total: number }>(url, token);
  return { items: res?.items ?? [], total: res?.total ?? 0 };
}

export async function apiGetStaffReport(
  token: string,
  id: number
): Promise<ApiManagedStaffReport> {
  const res = await api.get<ApiManagedStaffReport>(config.staffReports.detail(id), token);
  if (!res?.id) throw new Error('Staff report not found');
  return res;
}

export async function apiGenerateStaffReport(
  token: string,
  body: {
    catalog_key: string;
    title?: string;
    period_from?: string;
    period_to?: string;
    branch_id?: number;
    export_format?: string;
    priority?: string;
    parameters?: Record<string, unknown>;
    forward_to_roles?: string[];
    forward_to_staff_ids?: number[];
    forward_message?: string;
  }
): Promise<ApiManagedStaffReport> {
  const res = await api.post<ApiManagedStaffReport>(config.staffReports.generate, body, token);
  if (!res?.id) throw new Error('Report generation failed');
  return res;
}

export async function apiForwardStaffReport(
  token: string,
  id: number,
  body: { to_roles: string[]; to_staff_ids?: number[]; message?: string; priority?: string }
): Promise<ApiManagedStaffReport> {
  const res = await api.post<ApiManagedStaffReport>(config.staffReports.forward(id), body, token);
  if (!res?.id) throw new Error('Forward failed');
  return res;
}

export async function apiAcknowledgeStaffReport(
  token: string,
  id: number,
  notes?: string
): Promise<ApiManagedStaffReport> {
  const res = await api.post<ApiManagedStaffReport>(
    config.staffReports.acknowledge(id),
    { notes },
    token
  );
  if (!res?.id) throw new Error('Acknowledge failed');
  return res;
}

export async function apiReturnStaffReport(
  token: string,
  id: number,
  notes: string
): Promise<ApiManagedStaffReport> {
  const res = await api.post<ApiManagedStaffReport>(
    config.staffReports.returnReport(id),
    { notes },
    token
  );
  if (!res?.id) throw new Error('Return failed');
  return res;
}

/** Staff list of documents on a loan application. */
export type StaffApplicationDocument = {
  id: number;
  name?: string | null;
  doc_type?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  url?: string | null;
  uploaded_at?: string | null;
  is_active?: boolean;
};

export async function apiGetStaffApplicationDocuments(
  token: string,
  applicationId: number
): Promise<StaffApplicationDocument[]> {
  const res = await api.get<StaffApplicationDocument[]>(
    config.staff.applicationDocuments(applicationId),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiGetMyPermissions(token: string): Promise<ApiStaffPermission[]> {
  const res = await api.get<ApiStaffPermission[]>(config.permissions.me, token);
  return res ?? [];
}

export async function apiGetNotifications(token: string): Promise<unknown[]> {
  const res = await api.get<unknown[]>(config.staff.notifications, token);
  return res ?? [];
}

export async function apiMarkNotificationRead(token: string, id: number): Promise<void> {
  await api.put(`${config.staff.notifications}/${id}/read`, {}, token);
}

// ─── Staff profile (for branch_id / bank_id / full profile) ──────────────────

export type ApiStaffProfile = {
  id: number;
  branch_id: number;
  bank_id?: number;
  employee_id?: string;
  full_name?: string;
  email?: string;
  role?: string;
  credit_book?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function apiGetStaffProfile(token: string): Promise<ApiStaffProfile> {
  const res = await api.get<ApiStaffProfile>(config.staffAuth.me, token);
  if (!res?.id) throw new Error('Staff profile not found');
  return res;
}

export type ApiBranch = {
  id: number;
  name: string;
  code: string;
  entity_type: string;
  parent_id?: number;
};

function requireStaffBankId(profile: { bank_id?: number | null }): number {
  const bankId = profile.bank_id;
  if (bankId == null || !Number.isFinite(Number(bankId)) || Number(bankId) <= 0) {
    throw new Error(
      'Your staff profile has no bank assigned. Ask an administrator to link your account before continuing.'
    );
  }
  return Number(bankId);
}

export async function apiGetBranches(token: string): Promise<ApiBranch[]> {
  const profile = await apiGetStaffProfile(token);
  const bankId = requireStaffBankId(profile);
  const res = await api.get<ApiBranch[]>(`/banks/${bankId}/branches`, token);
  return res ?? [];
}

// ─── Districts (canonical list shared with dashboard) ──────────────────────

type ApiDistrict = {
  id: number;
  name: string;
  code?: string;
  is_active?: boolean;
  zone_name?: string | null;
};

type ApiDistrictListResponse = {
  districts: ApiDistrict[];
  total: number;
};

/**
 * Fetch canonical active districts from the backend.
 * Returns the district names only — callers feed them into picker UIs.
 * Limit is set high enough to cover the canonical Malawi list.
 */
export async function apiGetCanonicalDistricts(token: string): Promise<string[]> {
  const params = new URLSearchParams();
  params.set('is_active', 'true');
  params.set('limit', '1000');
  const res = await api.get<ApiDistrictListResponse>(`/districts?${params.toString()}`, token);
  const items = res?.districts ?? [];
  return items.map((d) => d.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
}

// ─── Clients ───────────────────────────────────────────────────────────────

export type ApiGetClientsOpts = {
  branch_id?: number;
  include_inactive?: boolean;
  sort?: string;
  limit?: number;
  skip?: number;
  search?: string;
  /** When true, only return clients assigned to the current staff (for "My clients" screen) */
  assigned_to_me?: boolean;
  /** Default on API is true — top-level clients only (omit group-linked individuals) */
  exclude_group_members?: boolean;
  /** Full branch list when staff role allows (must match branch_id filter rules on API) */
  all_branch_clients?: boolean;
  only_inactive?: boolean;
  has_active_loan?: boolean;
  is_verified?: boolean;
  onboarding_status?: 'draft' | 'completed';
};

export type ApiClientsPaginated = {
  items: ClientRow[];
  total: number;
  page: number;
  pages: number;
};

export async function apiGetClients(token: string, opts?: ApiGetClientsOpts): Promise<ClientRow[]> {
  return wrapWithPerf('apiGetClients', async () => {
  const params = new URLSearchParams();
  params.set('limit', String(opts?.limit ?? 500));
  params.set('skip', String(opts?.skip ?? 0));
  params.set('include_inactive', String(opts?.include_inactive ?? true));
  params.set('sort', opts?.sort ?? 'created_at_desc');
  if (opts?.branch_id) params.set('branch_id', String(opts.branch_id));
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  if (opts?.assigned_to_me) params.set('assigned_to_me', 'true');
  if (opts?.exclude_group_members === false) params.set('exclude_group_members', 'false');
  else if (opts?.exclude_group_members === true) params.set('exclude_group_members', 'true');
  if (opts?.all_branch_clients) params.set('all_branch_clients', 'true');
  if (opts?.only_inactive) params.set('only_inactive', 'true');
  if (opts?.has_active_loan === true) params.set('has_active_loan', 'true');
  if (opts?.has_active_loan === false) params.set('has_active_loan', 'false');
  const res = await api.get<{ items: ApiClient[] }>(`/clients/?${params.toString()}`, token);
  const items = res?.items ?? [];
  return items.map(clientToRow);
  });
}

export async function apiGetClientsPaginated(
  token: string,
  opts?: ApiGetClientsOpts & { page?: number }
): Promise<ApiClientsPaginated> {
  const limit = opts?.limit ?? 20;
  const page = opts?.page ?? 1;
  const skip = (page - 1) * limit;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('skip', String(skip));
  params.set('include_inactive', String(opts?.include_inactive ?? true));
  params.set('sort', opts?.sort ?? 'created_at_desc');
  if (opts?.branch_id) params.set('branch_id', String(opts.branch_id));
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  if (opts?.assigned_to_me) params.set('assigned_to_me', 'true');
  if (opts?.exclude_group_members === false) params.set('exclude_group_members', 'false');
  else if (opts?.exclude_group_members === true) params.set('exclude_group_members', 'true');
  if (opts?.all_branch_clients) params.set('all_branch_clients', 'true');
  if (opts?.only_inactive) params.set('only_inactive', 'true');
  if (opts?.has_active_loan === true) params.set('has_active_loan', 'true');
  if (opts?.has_active_loan === false) params.set('has_active_loan', 'false');
  if (opts?.is_verified === true) params.set('is_verified', 'true');
  if (opts?.is_verified === false) params.set('is_verified', 'false');
  if (opts?.onboarding_status) params.set('onboarding_status', opts.onboarding_status);
  const res = await api.get<{ items: ApiClient[]; total: number; page: number; size?: number; pages: number }>(
    `/clients/?${params.toString()}`,
    token
  );
  const items = (res?.items ?? []).map(clientToRow);
  return {
    items,
    total: res?.total ?? items.length,
    page: res?.page ?? page,
    pages: res?.pages ?? 1,
  };
}

export async function apiVerifyClient(token: string, clientId: number): Promise<void> {
  // Relative path — absolute URLs can 307-redirect and strip Authorization on Android RN fetch.
  await api.patch<ApiClient>(`/clients/${clientId}/verify`, {}, token);
}

export async function apiGetClient(token: string, id: string): Promise<ClientRow | null> {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  // Relative path — avoids slash-redirect stripping Authorization on some RN fetch builds.
  const res = await api.get<ApiClient>(`/clients/${numId}`, token);
  return res ? clientToRow(res) : null;
}

/** Staff creates client via POST /clients. Uses staff's branch/bank from /auth/me. */
/** Staff updates client via PUT /clients/{id}. Converts photo URIs to base64 for backend. */
export type ApiClientUpdate = {
  full_name?: string;
  phone_number?: string;
  /** null clears personal ID on organization (GROUP/COOPERATIVE) profiles. */
  national_id?: string | null;
  email?: string;
  address?: string;
  client_type?: string;
  /** draft | finished — used by API when validating complete profiles. */
  save_mode?: 'draft' | 'finished';
  occupation?: string | null;
  monthly_income?: number;
  is_verified?: boolean;
  gender?: string | null;
  organization_name?: string;
  date_of_birth?: string | null;
  employer?: string;
  marital_status?: string | null;
  next_of_kin_name?: string | null;
  next_of_kin_phone?: string | null;
  next_of_kin_relationship?: string | null;
  bank_account_number?: string;
  bank_account_name?: string;
  bank_name?: string;
  bank_branch?: string;
  profile_photo_base64?: string;
  id_document_base64?: string;
  id_document_back_base64?: string;
  group_constitution_base64?: string;
  profile_photo_path?: string | null;
  id_document_path?: string | null;
  id_document_back_path?: string | null;
  group_constitution_path?: string;
  district_id?: number;
  community_type?: string;
  village_head?: string;
  village_head_phone?: string;
  registration_number?: string;
  registration_date?: string;
  meeting_schedule?: string;
  group_purpose?: string;
  member_count?: number;
  chairperson_name?: string;
  chairperson_phone?: string;
  secretary_name?: string;
  secretary_phone?: string;
  treasurer_name?: string;
  treasurer_phone?: string;
};

export async function apiPutStaffClientProfile(
  token: string,
  clientId: string,
  body: ApiClientUpdate
): Promise<void> {
  const numId = parseInt(clientId, 10);
  if (isNaN(numId)) throw new Error('Invalid client ID');
  await api.put<ApiClient>(`/clients/${numId}`, body, token);
}

export async function apiStaffUploadKycDocument(
  token: string,
  clientId: string,
  uri: string,
  field: import('@/lib/client-portal/api').KycUploadField,
  fileName?: string,
  mimeType?: string
): Promise<{ path: string }> {
  const numId = parseInt(clientId, 10);
  if (isNaN(numId)) throw new Error('Invalid client ID');
  const name = fileName ?? uri.split('/').pop() ?? `kyc-${Date.now()}.jpg`;
  const ext = name.split('.').pop()?.toLowerCase();
  const mime =
    mimeType && mimeType !== 'application/octet-stream'
      ? mimeType
      : ext === 'pdf'
        ? 'application/pdf'
        : ext === 'png'
          ? 'image/png'
          : 'image/jpeg';

  const formData = new FormData();
  formData.append('file', { uri, name, type: mime } as unknown as Blob);
  formData.append('field', field);

  const res = await api.postForm<unknown>(`/clients/${numId}/kyc/upload`, formData, token);
  const { normalizeKycUploadPath } = await import('@/lib/client-portal/api');
  return { path: normalizeKycUploadPath(res) };
}

export async function apiUpdateClient(
  token: string,
  id: string,
  updates: Partial<ClientRow> & { photo_uri?: string; id_document_uri?: string }
): Promise<void> {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) throw new Error('Invalid client ID');
  const body: ApiClientUpdate = {};
  if (updates.name !== undefined) body.full_name = updates.name;
  if (updates.phone_number !== undefined) body.phone_number = updates.phone_number;
  if (updates.national_id !== undefined) body.national_id = updates.national_id;
  if (updates.email !== undefined) body.email = updates.email;
  if (updates.address !== undefined) body.address = updates.address;
  if (updates.occupation !== undefined) body.occupation = updates.occupation;
  if (updates.monthly_income !== undefined) body.monthly_income = updates.monthly_income;
  const isLocalUploadUri = (uri?: string) =>
    !!uri &&
    (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://'));

  if (isLocalUploadUri(updates.photo_uri)) {
    const b64 = await uriToBase64(updates.photo_uri!);
    if (!b64) throw new Error('Could not read the client photo for upload.');
    body.profile_photo_base64 = b64;
  }
  if (isLocalUploadUri(updates.id_document_uri)) {
    const b64 = await uriToBase64(updates.id_document_uri!);
    if (!b64) throw new Error('Could not read the ID document for upload.');
    body.id_document_base64 = b64;
  }
  await api.put<ApiClient>(`/clients/${numId}`, body, token);
}

export async function apiSyncCreateClient(
  token: string,
  input: {
    bank_id: number;
    branch_id?: number | null;
    client_id: string;
    password: string;
    full_name: string;
    national_id?: string | null;
    email?: string | null;
    phone_number?: string | null;
    address?: string | null;
    client_type?: string;
  }
): Promise<ClientRow> {
  const body = {
    bank_id: input.bank_id,
    branch_id: input.branch_id,
    client_id: input.client_id,
    full_name: input.full_name.trim(),
    national_id: input.national_id?.trim() || null,
    email: input.email?.trim() || null,
    phone_number: input.phone_number?.trim() || null,
    address: input.address?.trim() || null,
    client_type: input.client_type ?? 'INDIVIDUAL',
    password: input.password,
  };
  const res = await api.post<ApiClient>(`${config.apiBase}/clients/`, body, token);
  return clientToRow(res);
}

export async function apiCreateClient(
  token: string,
  input: {
    name: string;
    phone_number?: string;
    national_id?: string;
    address?: string;
    email?: string;
    client_type?: 'INDIVIDUAL' | 'SME' | 'COOPERATIVE' | 'GROUP';
    business_location?: GeolocationInput;
  }
): Promise<ClientRow> {
  const profile = await apiGetStaffProfile(token);
  const bankId = requireStaffBankId(profile);
  const branchId = profile.branch_id;
  if (branchId == null || Number.isNaN(Number(branchId))) {
    throw new Error(
      'Your staff profile has no branch assigned. Ask an administrator to link your account to a branch before registering clients.'
    );
  }
  const clientId = `COFI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = randomPassword(12);
  const body = {
    bank_id: bankId,
    branch_id: branchId,
    client_id: clientId,
    full_name: input.name.trim(),
    national_id: input.national_id?.trim() || null,
    email: input.email?.trim() || null,
    phone_number: input.phone_number?.trim() || null,
    address: input.address?.trim() || null,
    client_type: input.client_type ?? 'INDIVIDUAL',
    password,
  };
  const res = await api.post<ApiClient>('/clients/', body, token);
  if (input.business_location && (input.client_type === 'SME' || input.client_type === 'COOPERATIVE') && res?.id) {
    try {
      await apiSetClientBusinessLocation(token, res.id, input.business_location);
    } catch { /* optional */ }
  }
  return clientToRow(res);
}

// ─── Group parent: members, leaders, aggregate (GET/POST /clients/{id}/…) ───

export async function apiGetGroupMembers(token: string, groupClientId: number): Promise<ClientRow[]> {
  const res = await api.get<ApiClient[]>(`/clients/${groupClientId}/members`, token);
  return (res ?? []).map(clientToRow);
}

export async function apiAddGroupMember(
  token: string,
  groupClientId: number,
  body: GroupMemberCreateInput
): Promise<ClientRow> {
  const res = await api.post<ApiClient>(`/clients/${groupClientId}/members`, body, token);
  return clientToRow(res);
}

export async function apiRemoveGroupMember(
  token: string,
  groupClientId: number,
  memberClientId: number
): Promise<void> {
  await api.delete(`/clients/${groupClientId}/members/${memberClientId}`, token);
}

export async function apiGetGroupLeaders(
  token: string,
  groupClientId: number
): Promise<GroupClientLeaderResponse[]> {
  const res = await api.get<GroupClientLeaderResponse[]>(`/clients/${groupClientId}/leaders`, token);
  return res ?? [];
}

export async function apiUpsertGroupLeaderSlot(
  token: string,
  groupClientId: number,
  body: GroupClientLeaderSlotUpsert
): Promise<GroupClientLeaderResponse> {
  return api.put<GroupClientLeaderResponse>(`/clients/${groupClientId}/leaders/slot`, body, token);
}

export async function apiCreateCustomGroupLeader(
  token: string,
  groupClientId: number,
  body: GroupClientLeaderCustomCreate
): Promise<GroupClientLeaderResponse> {
  return api.post<GroupClientLeaderResponse>(`/clients/${groupClientId}/leaders/custom`, body, token);
}

export async function apiPatchGroupLeader(
  token: string,
  groupClientId: number,
  leaderId: number,
  body: GroupClientLeaderPatch
): Promise<GroupClientLeaderResponse> {
  return api.patch<GroupClientLeaderResponse>(
    `/clients/${groupClientId}/leaders/${leaderId}`,
    body,
    token
  );
}

export async function apiDeleteGroupLeader(
  token: string,
  groupClientId: number,
  leaderId: number
): Promise<void> {
  await api.delete(`/clients/${groupClientId}/leaders/${leaderId}`, token);
}

export async function apiGetGroupLoanAggregate(
  token: string,
  groupClientId: number
): Promise<GroupLoanAggregateResponse> {
  return api.get<GroupLoanAggregateResponse>(
    `/clients/${groupClientId}/group-loan-aggregate`,
    token
  );
}

// ─── Geolocation (collateral, business, SME group) ──────────────────────────

/** Add collateral to a loan application (with optional geolocation and document_keys) */
export async function apiAddApplicationCollateral(
  token: string,
  applicationId: number,
  collateral: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    registration_number?: string;
    other_type_label?: string;
    /** Required for GROUP_MUTUAL_GUARANTEE */
    guarantee_property?: string;
    /** Group loans: primary member pledging this collateral */
    pledgor_client_id?: number;
    /** Group loans: all members jointly pledging this collateral */
    pledgor_client_ids?: number[];
    geolocation?: GeolocationInput;
    document_keys?: Array<{ key: string; file_name: string; doc_type?: string }>;
  }
): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    loan_application_id: applicationId,
    collateral_type: collateral.collateral_type,
    description: collateral.description,
    estimated_value: collateral.estimated_value,
    registration_number: collateral.registration_number,
    // Geolocation applied via separate location endpoint after create.
  };
  if (collateral.guarantee_property?.trim()) body.guarantee_property = collateral.guarantee_property.trim();
  if (collateral.other_type_label?.trim()) body.other_type_label = collateral.other_type_label.trim();
  if (collateral.pledgor_client_ids && collateral.pledgor_client_ids.length > 0) {
    body.pledgor_client_ids = collateral.pledgor_client_ids.filter((id) => id > 0);
    body.pledgor_client_id = (body.pledgor_client_ids as number[])[0];
  } else if (collateral.pledgor_client_id != null) {
    body.pledgor_client_id = collateral.pledgor_client_id;
  }
  if (collateral.document_keys && collateral.document_keys.length > 0) {
    body.document_keys = collateral.document_keys;
  }
  return api.post<{ id: number }>(
    `${config.apiBase}/loans/applications/${applicationId}/collateral`,
    body,
    token
  );
}

/** Set collateral location on a loan application (mobile GPS capture) */
export async function apiSetApplicationCollateralLocation(
  token: string,
  applicationId: number,
  collateralId: number,
  location: GeolocationInput
): Promise<GeolocationResponse> {
  return api.put<GeolocationResponse>(
    `${config.apiBase}/loans/applications/${applicationId}/collateral/${collateralId}/location`,
    location,
    token
  );
}

/** Set collateral location on a loan */
export async function apiSetLoanCollateralLocation(
  token: string,
  loanId: number,
  collateralId: number,
  location: GeolocationInput
): Promise<GeolocationResponse> {
  return api.put<GeolocationResponse>(
    `${config.apiBase}/loans/${loanId}/collateral/${collateralId}/location`,
    location,
    token
  );
}

/** Set business location on a loan application (SME) */
export async function apiSetApplicationBusinessLocation(
  token: string,
  applicationId: number,
  location: GeolocationInput
): Promise<GeolocationResponse> {
  return api.put<GeolocationResponse>(
    `${config.apiBase}/loans/applications/${applicationId}/business-location`,
    location,
    token
  );
}

/** Set SME/cooperative business location on a client */
export async function apiSetClientBusinessLocation(
  token: string,
  clientId: number,
  location: GeolocationInput
): Promise<GeolocationResponse> {
  return api.put<GeolocationResponse>(
    `${config.apiBase}/clients/${clientId}/business-location`,
    location,
    token
  );
}

/** Get geolocation for an entity */
export async function apiGetGeolocationByEntity(
  token: string,
  entityType: string,
  entityId: number
): Promise<GeolocationResponse | null> {
  const res = await api.get<GeolocationResponse | null>(
    `${config.apiBase}/geolocations/entity/${entityType}/${entityId}`,
    token
  );
  return res ?? null;
}

/** Staff map pin — geotagged property collateral (bank-scoped). */
export interface ApiPropertyMapPoint {
  geolocation_id: number;
  collateral_id: number;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  collateral_type: string;
  description?: string | null;
  other_type_label?: string | null;
  estimated_value?: number | null;
  client_id?: number | null;
  client_name?: string | null;
  loan_id?: number | null;
  application_id?: number | null;
  branch_id?: number | null;
  branch_name?: string | null;
  bank_id?: number | null;
  source_kind: 'vault' | 'loan' | 'application' | string;
}

/** List geotagged property collaterals for the staff Malawi map. */
export async function apiListPropertyMapPoints(
  token: string,
  opts?: { branchId?: number; q?: string }
): Promise<ApiPropertyMapPoint[]> {
  const params = new URLSearchParams();
  if (opts?.branchId != null) params.set('branch_id', String(opts.branchId));
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  const qs = params.toString();
  const url = qs ? `${config.geolocations.properties}?${qs}` : config.geolocations.properties;
  const res = await api.get<ApiPropertyMapPoint[]>(url, token);
  return Array.isArray(res) ? res : [];
}


// --- Survey ---

export interface SurveyQuestionData {
  id: number;
  bank_id: number;
  question_text: string;
  question_type: 'LIKERT' | 'RATING' | 'YES_NO' | 'MULTIPLE_CHOICE' | 'OPEN_ENDED';
  options?: string[];
  category?: string;
  is_active: boolean;
  is_mandatory: boolean;
  display_order: number;
  already_answered?: boolean;
  user_answer_value?: number | null;
  user_answer_text?: string | null;
  user_answer_options?: string[] | null;
}

export interface PendingSurvey {
  session_id: number;
  is_completed: boolean;
  created_at: string | null;
  questions: SurveyQuestionData[];
  total_questions: number;
  answered_questions: number;
}

export interface PendingSurveyResponse {
  has_pending_survey: boolean;
  survey: PendingSurvey | null;
}

export interface BatchRespondRequest {
  session_id: number;
  responses: {
    question_id: number;
    response_value?: number | null;
    response_text?: string | null;
    response_options?: string[] | null;
  }[];
  complete_session: boolean;
}

export interface BatchRespondResponse {
  success: boolean;
  responses_submitted: number;
  session_completed: boolean;
}

/** Get pending survey for the current client */
export async function apiGetPendingSurvey(token: string): Promise<PendingSurveyResponse> {
  return api.get<PendingSurveyResponse>(config.survey.pending, token);
}

/** Submit a single survey response */
export async function apiSurveyRespond(
  token: string,
  sessionId: number,
  data: { question_id: number; response_value?: number | null; response_text?: string | null; response_options?: string[] | null }
): Promise<{ success: boolean; session_completed: boolean; message: string }> {
  return api.post(`${config.survey.respond}/${sessionId}`, data, token);
}

/** Complete a survey session */
export async function apiSurveyComplete(
  token: string,
  sessionId: number
): Promise<{ success: boolean; session_completed: boolean; message: string }> {
  return api.post(`${config.survey.complete}/${sessionId}`, {}, token);
}

/** Submit multiple responses at once (offline queue support) */
export async function apiSurveyBatchRespond(
  token: string,
  data: BatchRespondRequest
): Promise<BatchRespondResponse> {
  return api.post<BatchRespondResponse>(config.survey.batchRespond, data, token);
}

// ─── Loan Penalties ─────────────────────────────────────────────────────────

export interface ApiPenalty {
  id: number;
  loan_id: number;
  penalty_type: string;
  amount: number;
  reason: string;
  imposed_at: string;
  imposed_by_name?: string;
  paid: boolean;
  paid_at?: string;
}

export async function apiGetLoanPenalties(token: string, loanId: number): Promise<ApiPenalty[]> {
  const res = await api.get<ApiPenalty[]>(`${config.apiBase}/loans/${loanId}/penalties`, token);
  return res ?? [];
}

export async function apiAddLoanPenalty(
  token: string,
  loanId: number,
  data: { penalty_type: string; amount: number; reason: string }
): Promise<ApiPenalty | null> {
  return api.post<ApiPenalty>(`${config.apiBase}/loans/${loanId}/penalties`, data, token);
}

// ─── Loan Waivers ───────────────────────────────────────────────────────────

export interface ApiWaiver {
  id: number;
  loan_id: number;
  waiver_type: string;
  amount: number;
  reason: string;
  approved: boolean;
  approved_by_name?: string;
  created_at: string;
}

export async function apiGetLoanWaivers(token: string, loanId: number): Promise<ApiWaiver[]> {
  const res = await api.get<ApiWaiver[]>(`${config.apiBase}/loans/${loanId}/waivers`, token);
  return res ?? [];
}

export async function apiRequestLoanWaiver(
  token: string,
  loanId: number,
  data: { waiver_type: string; amount: number; reason: string }
): Promise<ApiWaiver | null> {
  return api.post<ApiWaiver>(`${config.apiBase}/loans/${loanId}/waivers`, data, token);
}

// ─── Loan Documents ─────────────────────────────────────────────────────────

export interface ApiLoanDocument {
  id: number;
  loan_id: number;
  document_name: string;
  document_type: string;
  document_url: string;
  uploaded_by_name?: string;
  uploaded_at: string;
}

export async function apiGetLoanDocuments(token: string, loanId: number): Promise<ApiLoanDocument[]> {
  const res = await api.get<ApiLoanDocument[]>(`${config.apiBase}/loans/${loanId}/documents`, token);
  return res ?? [];
}

export async function apiAddLoanDocument(
  token: string,
  loanId: number,
  data: { document_name: string; document_type: string; document_url: string }
): Promise<ApiLoanDocument | null> {
  return api.post<ApiLoanDocument>(`${config.apiBase}/loans/${loanId}/documents`, data, token);
}

// ─── Loan Workout Requests ─────────────────────────────────────────────────

export interface ApiWorkoutRequest {
  id: number;
  loan_id: number;
  request_type: string;
  description: string;
  status: string;
  requested_by_name?: string;
  created_at: string;
  resolved_at?: string;
}

export async function apiGetLoanWorkoutRequests(token: string, loanId: number): Promise<ApiWorkoutRequest[]> {
  const res = await api.get<ApiWorkoutRequest[]>(`${config.apiBase}/loans/${loanId}/workout-requests`, token);
  return res ?? [];
}

export async function apiCreateWorkoutRequest(
  token: string,
  loanId: number,
  data: { request_type: string; description: string }
): Promise<ApiWorkoutRequest | null> {
  return api.post<ApiWorkoutRequest>(`${config.apiBase}/loans/${loanId}/workout-requests`, data, token);
}

// ─── Loan Notes ────────────────────────────────────────────────────────────

export interface ApiLoanNote {
  id: number;
  loan_id?: number | null;
  /** Backend field is ``content``; ``note`` kept for older clients. */
  note: string;
  content?: string;
  created_by_name?: string;
  created_at: string;
  note_type?: string;
}

function mapLoanNote(row: Record<string, unknown>): ApiLoanNote {
  const content = String(row.content ?? row.note ?? '');
  return {
    id: Number(row.id),
    loan_id: row.loan_id != null ? Number(row.loan_id) : null,
    note: content,
    content,
    created_by_name:
      typeof row.created_by_name === 'string' ? row.created_by_name : undefined,
    created_at: String(row.created_at ?? ''),
    note_type: typeof row.note_type === 'string' ? row.note_type : undefined,
  };
}

export async function apiGetLoanNotes(token: string, loanId: number): Promise<ApiLoanNote[]> {
  const res = await api.get<Record<string, unknown>[]>(
    `${config.apiBase}/loans/${loanId}/notes`,
    token
  );
  return (res ?? []).map(mapLoanNote);
}

export async function apiAddLoanNote(
  token: string,
  loanId: number,
  data: { note: string }
): Promise<ApiLoanNote | null> {
  const res = await api.post<Record<string, unknown>>(
    `${config.apiBase}/loans/${loanId}/notes`,
    { note: data.note, content: data.note },
    token
  );
  return res ? mapLoanNote(res) : null;
}

// ─── Repayment Reversal ─────────────────────────────────────────────────────

export interface ApiRepaymentReversal {
  id: number;
  repayment_id: number;
  reason: string;
  reversed_by_name?: string;
  reversed_at: string;
}

export async function apiReverseRepayment(
  token: string,
  repaymentId: number,
  reason: string
): Promise<ApiRepaymentReversal | null> {
  return api.post<ApiRepaymentReversal>(
    config.repayments.reverse(repaymentId),
    { reason },
    token
  );
}

/** Search recorded repayments via portfolio-history (no /loans/repayments/search route). */
export async function apiSearchRepayments(
  token: string,
  query: string
): Promise<ApiRepayment[]> {
  return apiGetPortfolioHistory(token, { search: query, limit: 50 });
}

// ─── Client Documents ──────────────────────────────────────────────────────

/** Normalized client document shape used by staff UI. */
export interface ApiClientDocument {
  id: number;
  client_id: number;
  document_name: string;
  document_type: string;
  document_url: string;
  uploaded_by_name?: string;
  uploaded_at: string;
  is_verified?: boolean;
}

/** Raw CustomerDocumentResponse from GET/POST /clients/{id}/documents */
type ApiCustomerDocumentRaw = {
  id: number;
  client_id: number;
  document_type: string;
  file_name: string;
  file_path?: string | null;
  upload_date?: string;
  created_at?: string;
  is_verified?: boolean;
  mime_type?: string | null;
};

function mapCustomerDocument(raw: ApiCustomerDocumentRaw): ApiClientDocument {
  return {
    id: raw.id,
    client_id: raw.client_id,
    document_name: raw.file_name,
    document_type: raw.document_type,
    document_url: raw.file_path || '',
    uploaded_at: raw.upload_date || raw.created_at || new Date().toISOString(),
    is_verified: raw.is_verified,
  };
}

export async function apiGetClientDocuments(token: string, clientId: number): Promise<ApiClientDocument[]> {
  const res = await api.get<ApiCustomerDocumentRaw[]>(
    `${config.apiBase}/clients/${clientId}/documents`,
    token
  );
  return (res ?? []).map(mapCustomerDocument);
}

export async function apiAddClientDocument(
  token: string,
  clientId: number,
  data: {
    document_type: string;
    file_name: string;
    uri: string;
    mime_type?: string;
  }
): Promise<ApiClientDocument | null> {
  const base64 = await uriToBase64(data.uri);
  const res = await api.post<ApiCustomerDocumentRaw>(
    `${config.apiBase}/clients/${clientId}/documents`,
    {
      document_type: data.document_type,
      file_name: data.file_name,
      file_content: base64,
      mime_type: data.mime_type ?? 'application/octet-stream',
    },
    token
  );
  return res ? mapCustomerDocument(res) : null;
}

export async function apiDeleteClientDocument(token: string, clientId: number, documentId: number): Promise<void> {
  await api.delete(`${config.apiBase}/clients/${clientId}/documents/${documentId}`, token);
}

// ─── Client Collateral Vault ────────────────────────────────────────────────

export interface ApiClientCollateralVaultItem extends ApiCollateral {
  client_id: number;
  created_at: string;
}

export async function apiGetClientCollateralVault(token: string, clientId: number): Promise<ApiClientCollateralVaultItem[]> {
  const res = await api.get<ApiClientCollateralVaultItem[]>(`${config.apiBase}/clients/${clientId}/collateral-vault`, token);
  return res ?? [];
}

export async function apiAddClientCollateralVaultItem(
  token: string,
  clientId: number,
  data: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    other_type_label?: string;
    registration_number?: string;
    geolocation?: GeolocationInput;
    document_keys?: Array<{ key: string; file_name: string; doc_type?: string }>;
  }
): Promise<ApiClientCollateralVaultItem | null> {
  const body: Record<string, unknown> = {
    collateral_type: data.collateral_type,
    description: data.description,
    estimated_value: data.estimated_value,
    registration_number: data.registration_number,
    geolocation: data.geolocation,
  };
  if (data.other_type_label?.trim()) body.other_type_label = data.other_type_label.trim();
  if (data.document_keys && data.document_keys.length > 0) body.document_keys = data.document_keys;
  return api.post<ApiClientCollateralVaultItem>(`${config.apiBase}/clients/${clientId}/collateral-vault`, body, token);
}

/** Upsert geolocation for any entity (e.g. vault collateral without loan/application context). */
export async function apiUpsertCollateralGeolocation(
  token: string,
  collateralId: number,
  location: GeolocationInput
): Promise<GeolocationResponse> {
  return api.post<GeolocationResponse>(
    `${config.apiBase}/geolocations/upsert`,
    {
      entity_type: 'COLLATERAL',
      entity_id: collateralId,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      city: location.city,
      region: location.region,
      country: location.country,
      postal_code: location.postal_code,
      accuracy_meters: location.accuracy_meters,
    },
    token
  );
}

export async function apiDeleteClientCollateralVaultItem(token: string, clientId: number, itemId: number): Promise<void> {
  await api.delete(`${config.apiBase}/clients/${clientId}/collateral-vault/${itemId}`, token);
}

// ─── TNM Mpamba / Airtel collections ───────────────────────────────────────

export type ApiCollectionInitiateResult = {
  reference: string;
  status: string;
  amount_minor?: number;
  msisdn?: string | null;
  loan_id?: number;
  repayment_id?: number | null;
  gl_posted?: boolean;
  failure_reason?: string | null;
  provider_code?: string;
};

export type ApiCollectionStatusResult = {
  reference: string;
  status: string;
  gl_posted?: boolean;
  failure_reason?: string | null;
};

/** Borrower self-service TNM Mpamba (maps legacy amount/phone fields → API shape). */
export async function apiTnmMpambaRepay(
  token: string,
  data: {
    loan_id: number;
    amount?: number;
    amount_minor?: number;
    phone_number?: string;
    msisdn?: string;
    reference?: string;
    client_reference?: string;
  }
): Promise<ApiCollectionInitiateResult | null> {
  const amount_minor = data.amount_minor ?? data.amount;
  const msisdn = (data.msisdn ?? data.phone_number ?? '').trim();
  if (amount_minor == null || amount_minor <= 0 || !msisdn) return null;
  return api.post<ApiCollectionInitiateResult>(config.mpamba.repay, {
    loan_id: data.loan_id,
    amount_minor,
    msisdn,
    client_reference: data.client_reference ?? data.reference,
  }, token);
}

export async function apiTnmMpambaStatus(
  token: string,
  reference: string
): Promise<ApiCollectionStatusResult | null> {
  return api.get<ApiCollectionStatusResult>(config.mpamba.repayStatus(reference), token);
}

/** Staff Airtel Money collection against a loan. Requires `airtel:collect`. */
export async function apiStaffAirtelCollectionInitiate(
  token: string,
  data: {
    loan_id: number;
    amount_minor: number;
    msisdn: string;
    narration?: string;
    client_reference?: string;
  }
): Promise<ApiCollectionInitiateResult> {
  return api.post<ApiCollectionInitiateResult>(config.airtel.staffInitiate, data, token);
}

export async function apiStaffAirtelCollectionStatus(
  token: string,
  reference: string
): Promise<ApiCollectionStatusResult> {
  return api.get<ApiCollectionStatusResult>(config.airtel.staffStatus(reference), token);
}

/** Staff TNM Mpamba collection against a loan. Requires `tnm:collect`. */
export async function apiStaffTnmCollectionInitiate(
  token: string,
  data: {
    loan_id: number;
    amount_minor: number;
    msisdn: string;
    narration?: string;
    client_reference?: string;
  }
): Promise<ApiCollectionInitiateResult> {
  return api.post<ApiCollectionInitiateResult>(config.mpamba.staffInitiate, data, token);
}

export async function apiStaffTnmCollectionStatus(
  token: string,
  reference: string
): Promise<ApiCollectionStatusResult> {
  return api.get<ApiCollectionStatusResult>(config.mpamba.staffStatus(reference), token);
}
