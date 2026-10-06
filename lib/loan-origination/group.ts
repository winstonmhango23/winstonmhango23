import type { GroupOriginationValidateRequest } from '@/lib/data/group-loan-types';
import { parseMajorAmountInputToMinor } from '@/lib/money/mwk-input';
import type { GroupMemberRow } from './types';

export function buildGroupAllocationPayload(args: {
  mode: 'equal' | 'custom';
  selectedMemberIds: number[];
  customMwkByMemberId: Record<number, string>;
}): Record<string, unknown> {
  const ids = [...args.selectedMemberIds].sort((a, b) => a - b);
  if (args.mode === 'equal') {
    return { mode: 'equal', member_client_ids: ids };
  }
  const lines = ids.map((member_client_id) => {
    const amount_minor = parseMajorAmountInputToMinor(
      String(args.customMwkByMemberId[member_client_id] ?? '')
    );
    return {
      member_client_id,
      amount_minor: amount_minor > 0 ? amount_minor : 0,
    };
  });
  return { mode: 'custom', member_client_ids: ids, lines };
}

export function validateCustomAllocationSum(
  selectedMemberIds: number[],
  customMwkByMemberId: Record<number, string>,
  totalMinor: number
): string | null {
  let sum = 0;
  for (const id of selectedMemberIds) {
    const amount_minor = parseMajorAmountInputToMinor(String(customMwkByMemberId[id] ?? ''));
    if (amount_minor <= 0) return 'Enter a positive MWK amount for each selected member.';
    sum += amount_minor;
  }
  if (sum !== totalMinor) {
    return `Custom amounts must add up to the total loan amount.`;
  }
  return null;
}

export function toGroupValidateRequest(args: {
  groupParentClientId: number;
  loanProductId: number;
  requestedAmountMinor: number;
  allocation: Record<string, unknown>;
  declareMutualGuaranteePathway?: boolean;
}): GroupOriginationValidateRequest {
  return {
    group_parent_client_id: args.groupParentClientId,
    loan_product_id: args.loanProductId,
    requested_amount_minor: args.requestedAmountMinor,
    group_loan_allocation: args.allocation,
    ...(args.declareMutualGuaranteePathway
      ? { declared_group_mutual_guarantee_pathway: true }
      : {}),
  };
}

export function mapStaffGroupMembers(rows: { id: string; name: string }[]): GroupMemberRow[] {
  return rows.map((r) => ({
    id: parseInt(r.id, 10),
    client_id: r.id,
    full_name: r.name,
  }));
}

export function mapMobileGroupMembers(
  rows: { id: number; client_id: string; full_name: string }[]
): GroupMemberRow[] {
  return rows.map((r) => ({
    id: r.id,
    client_id: r.client_id,
    full_name: r.full_name,
  }));
}
