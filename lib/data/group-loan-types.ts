/**
 * Group loan / group client shapes aligned with cofi-bms-api schemas and web `lms.ts`.
 */

/** Pre-flight group split (POST /loans/applications/validate-group-origination). */
export type GroupOriginationValidateRequest = {
  group_parent_client_id: number;
  loan_product_id: number;
  requested_amount_minor: number;
  group_loan_allocation: Record<string, unknown>;
  declared_group_mutual_guarantee_pathway?: boolean;
};

export type GroupOriginationValidateResponse = {
  normalized_allocation?: Record<string, unknown> | null;
  members_missing_collateral_preview: number[];
  collateral_required: boolean;
  per_member_collateral_required?: boolean;
  allocation_valid?: boolean;
  blockers?: string[];
  blocker_details?: string[];
  collateral_preview_mode?: string;
  group_mutual_pathway_active?: boolean;
};

/** Optional bucket totals returned for group portfolio (minor units). */
export type GroupLoanBucket = {
  loan_count: number;
  principal_total_minor: number;
  outstanding_principal_minor: number;
  total_repaid_minor: number;
};

export type GroupLoanAggregateResponse = {
  group_client_id: number;
  member_count: number;
  member_loans: GroupLoanBucket;
  group_direct_loans: GroupLoanBucket;
  combined: GroupLoanBucket;
};

export type GroupLeaderPermissions = {
  update_repayments?: boolean;
  add_collateral?: boolean;
  issue_guarantees?: boolean;
  manage_documents?: boolean;
  view_group_financials?: boolean;
  provision_member_credentials?: boolean;
  manage_group_roster?: boolean;
  manage_group_leaders?: boolean;
};

export type GroupClientLeaderResponse = {
  id: number;
  group_client_id: number;
  member_client_id: number;
  member_full_name: string;
  member_client_id_str: string;
  leader_slot?: string | null;
  custom_title?: string | null;
  permissions: GroupLeaderPermissions;
  created_at?: string | null;
  updated_at?: string | null;
};

export type GroupClientLeaderSlotUpsert = {
  leader_slot: 'chairperson' | 'secretary' | 'treasurer';
  member_client_id: number;
  permissions?: GroupLeaderPermissions;
};

export type GroupClientLeaderCustomCreate = {
  member_client_id: number;
  custom_title: string;
  permissions?: GroupLeaderPermissions;
};

export type GroupClientLeaderPatch = {
  permissions?: GroupLeaderPermissions;
  custom_title?: string | null;
};

/** POST /clients/{groupId}/members — mirrors API GroupMemberCreate. */
export type GroupMemberCreateInput = {
  client_id: string;
  full_name: string;
  password: string;
  national_id?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
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
  is_chairperson?: boolean;
};
