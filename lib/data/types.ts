/**
 * Shared data types for applications and clients.
 * Used by both SQLite and API layers for easy switchover.
 */

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface LoanApplicationRow {
  id: number;
  application_number: string;
  status: string;
  requested_amount: number;
  approved_amount?: number;
  requested_term_months: number;
  product_name: string;
  loan_product_id?: number;
  application_date: string;
  client_id?: string;
  client_name?: string;
  purpose?: string;
  assigned_staff_name?: string;
  assigned_cio_id?: number | null;
  assigned_cio_name?: string | null;
  documents_json?: string;
  created_at: string;
  sync_status?: SyncStatus;
  remote_id?: number | null;
  group_loan_allocation?: Record<string, unknown>;
  origination_stage?: string | null;
  /** CEO/CIO send-back reason (plain text or JSON {message, blockers}) when returned for rework. */
  origination_return_reason?: string | null;
  /** Product-specific dynamic form values serialized as JSON string (embedded). */
  application_notes?: string;
  /** Derived loan type label (first word of product name) for API metadata. */
  loan_type?: string;
  /** Selected repayment strategy key (e.g. DECLINING_BALANCE_EQUAL_INSTALLMENTS). */
  selected_repayment_strategy?: string;
  /** Viewer is a group member on a parent application (from /mobile/me/loan-applications). */
  is_group_application?: boolean;
  my_share_requested_amount_minor?: number | null;
  group_requested_amount_minor?: number | null;
}

export interface ClientRow {
  id: string;
  name: string;
  phone_number?: string;
  national_id?: string;
  email?: string;
  address?: string;
  occupation?: string;
  monthly_income?: number;
  customer_number?: string;
  photo_uri?: string;
  id_document_uri?: string;
  /** KYC ID document reverse side (when API provides it). */
  id_document_back_uri?: string;
  /** Group constitution PDF/image path for GROUP clients. */
  group_constitution_uri?: string;
  /** Shared group photo (all members) for GROUP / COOPERATIVE parents. */
  group_photo_uri?: string;
  created_at: string;
  updated_at?: string;
  is_verified?: boolean;
  is_active?: boolean;
  /** GROUP | SME | COOPERATIVE | INDIVIDUAL — from API when present */
  client_type?: string;
  parent_client_id?: string | null;
  member_count?: number;
  is_group_admin?: boolean;
  group_role?: string | null;
  sync_status?: SyncStatus;
  remote_id?: number | null;
  /** Branch the client belongs to (required for staff loan application create). */
  branch_id?: number;
  /** KYC / profile fields from GET /clients/{id} */
  gender?: string;
  date_of_birth?: string;
  marital_status?: string;
  employer?: string;
  organization_name?: string;
  district_name?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relationship?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  bank_name?: string;
  bank_branch?: string;
}

export interface PickedDocument {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  docType: string;
}
