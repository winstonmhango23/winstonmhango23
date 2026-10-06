/**
 * Sync queue and offline-first types.
 */

export type SyncStatus = 'pending' | 'synced' | 'failed';

export type SyncOperation =
  | 'CREATE_PORTAL_INDIVIDUAL'
  | 'CREATE_PORTAL_GROUP'
  | 'CREATE_KYC_UPLOAD'
  | 'SAVE_CLIENT_KYC'
  | 'CREATE_CLIENT'
  | 'UPDATE_CLIENT'
  | 'VERIFY_CLIENT'
  | 'UPDATE_CLIENT_KYC'
  | 'CREATE_GROUP_MEMBER'
  | 'CREATE_APPLICATION'
  | 'ADD_APPLICATION_COLLATERAL'
  | 'ADD_APPLICATION_GUARANTOR'
  | 'ATTACH_VAULT_COLLATERAL'
  | 'ATTACH_CATALOG_GUARANTOR'
  | 'APPLICATION_ACTION'
  | 'UPDATE_APPLICATION'
  | 'DELETE_APPLICATION'
  | 'ORIGINATION_TRANSITION'
  | 'CREATE_CLIENT_DEPOSIT'
  | 'CREATE_CLIENT_WITHDRAWAL'
  | 'CREATE_CLIENT_TRANSFER'
  | 'FUND_CLIENT_COLLATERAL'
  | 'CREATE_CUSTOMER_REPAYMENT'
  | 'CREATE_COLLECTION_CASE'
  | 'CREATE_COLLECTION_ACTIVITY'
  | 'RESOLVE_COLLECTION_CASE'
  | 'ASSIGN_COLLECTION_CASE';

export const SYNC_OPERATION_ORDER: Record<SyncOperation, number> = {
  CREATE_PORTAL_INDIVIDUAL: 0,
  CREATE_PORTAL_GROUP: 0,
  CREATE_KYC_UPLOAD: 0.5,
  // After the documents so the saved record already carries their server paths.
  SAVE_CLIENT_KYC: 0.8,
  CREATE_CLIENT: 1,
  UPDATE_CLIENT: 1.2,
  VERIFY_CLIENT: 1.3,
  UPDATE_CLIENT_KYC: 1.5,
  CREATE_GROUP_MEMBER: 2,
  CREATE_APPLICATION: 3,
  // Security must be attached before the application is submitted for review.
  ADD_APPLICATION_COLLATERAL: 3.2,
  ADD_APPLICATION_GUARANTOR: 3.3,
  ATTACH_VAULT_COLLATERAL: 3.25,
  ATTACH_CATALOG_GUARANTOR: 3.35,
  ORIGINATION_TRANSITION: 3.5,
  // Submit/withdraw last, once security and workflow steps have landed.
  APPLICATION_ACTION: 3.6,
  UPDATE_APPLICATION: 4,
  DELETE_APPLICATION: 4.5,
  // Account money moves after loan/security work so balances stay coherent.
  CREATE_CLIENT_DEPOSIT: 5,
  CREATE_CLIENT_WITHDRAWAL: 5.1,
  CREATE_CLIENT_TRANSFER: 5.2,
  FUND_CLIENT_COLLATERAL: 5.3,
  // Borrower deposit-style repayments after account funding.
  CREATE_CUSTOMER_REPAYMENT: 5.4,
  // Collections follow repayment money moves so case notes land after payments.
  CREATE_COLLECTION_CASE: 6,
  CREATE_COLLECTION_ACTIVITY: 6.1,
  ASSIGN_COLLECTION_CASE: 6.2,
  RESOLVE_COLLECTION_CASE: 6.3,
};

export const PORTAL_SYNC_OPERATIONS: SyncOperation[] = [
  'CREATE_PORTAL_INDIVIDUAL',
  'CREATE_PORTAL_GROUP',
];

export type SyncQueueSummaryItem = {
  id: number;
  kind: 'queue' | 'repayment' | 'application';
  operation: string;
  label: string;
  status: 'pending' | 'failed' | 'conflict';
  createdAt: string;
  lastError: string | null;
  entityLocalId: string;
  /** Present when kind is application and the sync_queue row was missing. */
  orphaned?: boolean;
};

export interface SyncQueueRow {
  id: number;
  operation: SyncOperation;
  entity_type: string;
  entity_local_id: number | string;
  payload: string; // JSON
  created_at: string;
  retry_count: number;
  last_error: string | null;
}

export interface PendingRepaymentPayload {
  loan_id: number;
  client_id: number;
  loan_account_number: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
}
