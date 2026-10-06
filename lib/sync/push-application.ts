/**
 * Shared remote create for loan applications.
 * Used by online-first save and by the offline sync queue.
 */

import * as api from '@/lib/data/api';
import type { GeolocationInput } from '@/lib/data/geolocation-types';
import type { LoanApplicationRow } from '@/lib/data/types';
import { getStoredAuth } from '@/lib/storage';
import {
  payloadHasGroupAllocation,
  validateGroupAllocationAtSync,
} from '@/lib/sync/group-allocation-sync';
import type * as SQLite from 'expo-sqlite';

export type ApplicationPushPayload = {
  application_number?: string;
  status?: string;
  requested_amount: number;
  approved_amount?: number | null;
  requested_term_months: number;
  product_name: string;
  application_date?: string;
  client_id?: string | number | null;
  client_name?: string | null;
  purpose?: string | null;
  documents_json?: string | unknown;
  group_loan_allocation?: Record<string, unknown>;
  loan_type?: string;
  application_notes?: string;
  loan_product_id?: number;
  selected_repayment_strategy?: string;
  business_location?: GeolocationInput;
  group_parent_client_id?: number;
  declare_mutual_guarantee_pathway?: boolean;
  /** Stable offline idempotency key (usually local application_number). */
  client_reference?: string;
};

function parseDocuments(
  documentsJson: unknown
): Array<{ uri: string; name: string; docType: string; mimeType?: string }> {
  try {
    if (!documentsJson) return [];
    const parsed =
      typeof documentsJson === 'string' ? JSON.parse(documentsJson) : documentsJson;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function resolveClientIdForStaff(
  database: SQLite.SQLiteDatabase | null,
  clientRef: string
): Promise<string> {
  if (!clientRef.startsWith('local-')) return clientRef;
  if (!database) {
    throw new Error('Linked client not yet synced; client will sync first');
  }
  const remote = await database.getFirstAsync<{ remote_id: number | null }>(
    'SELECT remote_id FROM clients WHERE id = ?',
    [clientRef]
  );
  if (remote?.remote_id == null) {
    throw new Error('Linked client not yet synced; client will sync first');
  }
  return String(remote.remote_id);
}

/**
 * Create a loan application on the remote API.
 * Optionally validates group allocation and attaches documents / business location.
 */
export async function pushLoanApplicationToRemote(
  token: string,
  payload: ApplicationPushPayload,
  opts?: {
    database?: SQLite.SQLiteDatabase | null;
    /** When true, skip remote create if already deferred for offline group allocation. */
    requireOnlineForGroupAllocation?: boolean;
    isOnline?: () => Promise<boolean>;
  }
): Promise<LoanApplicationRow> {
  const hasClientId = payload.client_id != null && String(payload.client_id).trim() !== '';
  const docs = parseDocuments(payload.documents_json);

  if (
    opts?.requireOnlineForGroupAllocation &&
    payloadHasGroupAllocation(payload) &&
    opts.isOnline &&
    !(await opts.isOnline())
  ) {
    throw new Error('OFFLINE_DEFERRED: Group loan allocation requires an internet connection');
  }

  let groupAllocation = payload.group_loan_allocation;
  if (payloadHasGroupAllocation(payload)) {
    groupAllocation = await validateGroupAllocationAtSync(token, payload as Record<string, unknown>, {
      isClient: !hasClientId,
    });
  }

  let created: LoanApplicationRow;

  if (hasClientId) {
    const resolvedClientId = await resolveClientIdForStaff(
      opts?.database ?? null,
      String(payload.client_id)
    );
    created = await api.apiCreateApplicationStaff(token, {
      application_number: String(payload.application_number ?? `APP-${Date.now()}`),
      status: String(payload.status ?? 'DRAFT'),
      requested_amount: Number(payload.requested_amount),
      approved_amount: payload.approved_amount as number | undefined,
      requested_term_months: Number(payload.requested_term_months),
      product_name: String(payload.product_name),
      application_date: String(payload.application_date ?? new Date().toISOString().slice(0, 10)),
      client_id: resolvedClientId,
      client_name: payload.client_name as string | undefined,
      purpose: payload.purpose as string | undefined,
      documents_json:
        typeof payload.documents_json === 'string'
          ? payload.documents_json
          : payload.documents_json != null
            ? JSON.stringify(payload.documents_json)
            : undefined,
      group_loan_allocation: groupAllocation,
      loan_type: payload.loan_type,
      application_notes: payload.application_notes,
      loan_product_id: payload.loan_product_id,
      selected_repayment_strategy: payload.selected_repayment_strategy,
    });
  } else {
    // Borrower path — never hit staff /loans/products (401 → false logout).
    let productId =
      payload.loan_product_id != null ? Number(payload.loan_product_id) : NaN;
    if (!Number.isFinite(productId) || productId <= 0) {
      const products = await api.apiGetBorrowerLoanProducts(token);
      const match =
        products.find((p) => p.name === payload.product_name) ?? products[0];
      if (!match) {
        throw new Error('No loan products available to sync this draft');
      }
      productId = match.id;
    }

    created = await api.apiCreateMobileLoanApplication(token, {
      loan_product_id: productId,
      requested_amount: payload.requested_amount as number,
      requested_term_months: payload.requested_term_months as number,
      purpose: (payload.purpose as string) ?? 'General',
      loan_type: payload.loan_type,
      application_notes: payload.application_notes,
      group_loan_allocation: groupAllocation,
      selected_repayment_strategy: payload.selected_repayment_strategy,
      client_reference:
        (payload.client_reference as string | undefined) ||
        (payload.application_number as string | undefined) ||
        undefined,
    });
  }

  if (docs.length > 0 && created?.id) {
    const storedAuth = await getStoredAuth();
    if (hasClientId && storedAuth?.user) {
      const staffId = storedAuth.user.id ? Number(storedAuth.user.id) : 1;
      for (const d of docs) {
        try {
          await api.apiAddApplicationDocumentStaff(token, created.id, d, staffId);
        } catch {
          /* continue with remaining docs */
        }
      }
    } else if (!hasClientId) {
      for (const d of docs) {
        try {
          await api.apiAddApplicationDocumentClient(token, created.id, d);
        } catch {
          /* continue */
        }
      }
    }
  }

  if (payload.business_location && created?.id) {
    try {
      await api.apiSetApplicationBusinessLocation(
        token,
        created.id,
        payload.business_location
      );
    } catch {
      /* optional */
    }
  }

  return {
    ...created,
    sync_status: 'synced',
  };
}
