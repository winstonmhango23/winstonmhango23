/**
 * Server-side group allocation validation — run at sync time when wizard deferred offline.
 */

import * as api from '@/lib/data/api';
import { toGroupValidateRequest } from '@/lib/loan-origination/group';

export function payloadHasGroupAllocation(payload: Record<string, unknown>): boolean {
  const gla = payload.group_loan_allocation;
  if (gla == null || typeof gla !== 'object') return false;
  return Object.keys(gla as Record<string, unknown>).length > 0;
}

export async function validateGroupAllocationAtSync(
  token: string,
  payload: Record<string, unknown>,
  opts: { isClient: boolean }
): Promise<Record<string, unknown>> {
  const allocation = payload.group_loan_allocation as Record<string, unknown>;
  const parentId = Number(
    payload.group_parent_client_id ?? payload.client_id ?? 0
  );
  const productId = Number(payload.loan_product_id ?? 0);
  const amountMinor = Number(payload.requested_amount ?? 0);

  if (!parentId || !productId || !amountMinor) {
    throw new Error('Group loan sync payload missing parent, product, or amount');
  }

  const body = toGroupValidateRequest({
    groupParentClientId: parentId,
    loanProductId: productId,
    requestedAmountMinor: amountMinor,
    allocation,
    declareMutualGuaranteePathway: Boolean(payload.declare_mutual_guarantee_pathway),
  });

  const res = opts.isClient
    ? await api.apiValidateMobileGroupOrigination(token, body)
    : await api.apiValidateGroupOrigination(token, body);

  const blockers = Array.isArray((res as { blockers?: string[] }).blockers)
    ? (res as { blockers?: string[] }).blockers
    : [];
  if (blockers && blockers.length > 0) {
    throw new Error(
      blockers[0] ?? 'Group member allocation was rejected by the server'
    );
  }

  if (res.normalized_allocation && typeof res.normalized_allocation === 'object') {
    return res.normalized_allocation as Record<string, unknown>;
  }
  return allocation;
}
