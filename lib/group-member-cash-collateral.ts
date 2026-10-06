/**
 * Group member cash collateral (15% rule) helpers.
 * Aligns with BMS LoanCollateralManager: 15% of each member's loan allocation share.
 */

export const MEMBER_CASH_COLLATERAL_RATE = 0.15;

export const MEMBER_CASH_COLLATERAL_DESCRIPTION =
  'Member cash collateral (15% of member loan share)';

export const GROUP_MUTUAL_GUARANTEE_DESCRIPTION =
  'Group mutual guarantee — members jointly guarantee the facility';

export type GroupAllocationLine = {
  member_client_id: number;
  amount_minor: number;
};

export type MemberCashCollateralLine = {
  member_client_id: number;
  member_name: string;
  loan_share_minor: number;
  cash_collateral_minor: number;
};

export function isMemberCashCollateralType(collateralType: string): boolean {
  return (
    collateralType === 'MEMBER_CASH_COLLATERAL_PCT' || collateralType === 'CASH_DEPOSITS'
  );
}

export function isGroupMutualGuaranteeType(collateralType: string): boolean {
  return collateralType === 'GROUP_MUTUAL_GUARANTEE';
}

/** Types that should never show GPS / property photo capture. */
export function collateralHidesPropertyCapture(collateralType: string): boolean {
  return (
    isMemberCashCollateralType(collateralType) ||
    isGroupMutualGuaranteeType(collateralType) ||
    collateralType === 'GUARANTEE' ||
    collateralType === 'CHATTELS' ||
    collateralType === 'STOCK_INVENTORY' ||
    collateralType === 'EQUIPMENT' ||
    collateralType === 'VEHICLE'
  );
}

export function memberCashCollateralMinor(loanShareMinor: number): number {
  const share = Number(loanShareMinor);
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.round(share * MEMBER_CASH_COLLATERAL_RATE);
}

export function parseGroupAllocationLines(
  allocation: Record<string, unknown> | null | undefined,
  opts?: { totalAmountMinor?: number | null; memberIds?: number[] }
): GroupAllocationLine[] {
  if (!allocation || typeof allocation !== 'object') return [];

  const mode = String(allocation.mode ?? 'custom');
  const memberIds = Array.isArray(allocation.member_client_ids)
    ? (allocation.member_client_ids as unknown[])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    : [];

  let lines: GroupAllocationLine[] = [];
  if (Array.isArray(allocation.lines)) {
    for (const row of allocation.lines) {
      if (!row || typeof row !== 'object') continue;
      const mid = Number((row as { member_client_id?: unknown }).member_client_id);
      const minor = Number((row as { amount_minor?: unknown }).amount_minor);
      if (Number.isFinite(mid) && mid > 0 && Number.isFinite(minor) && minor > 0) {
        lines.push({ member_client_id: mid, amount_minor: minor });
      }
    }
  } else {
    for (const [key, val] of Object.entries(allocation)) {
      if (!/^\d+$/.test(key)) continue;
      const entry = val as { amount_minor?: number } | number | undefined;
      const minor =
        typeof entry === 'number'
          ? entry
          : typeof entry === 'object' && entry?.amount_minor != null
            ? Number(entry.amount_minor)
            : NaN;
      if (Number.isFinite(minor) && minor > 0) {
        lines.push({ member_client_id: Number(key), amount_minor: minor });
      }
    }
  }

  const ids = opts?.memberIds?.length
    ? opts.memberIds
    : memberIds.length > 0
      ? memberIds
      : lines.map((l) => l.member_client_id);

  if (
    mode === 'equal' &&
    opts?.totalAmountMinor != null &&
    opts.totalAmountMinor > 0 &&
    ids.length > 0
  ) {
    const per = Math.round(opts.totalAmountMinor / ids.length);
    return ids.map((id) => ({
      member_client_id: id,
      amount_minor: per,
    }));
  }

  if (lines.length > 0) return lines;
  return [];
}

export function buildMemberCashCollateralListing(opts: {
  allocation: Record<string, unknown> | null | undefined;
  selectedMemberIds: number[];
  memberNameById?: Record<number, string>;
  totalAmountMinor?: number | null;
}): { lines: MemberCashCollateralLine[]; totalCashMinor: number } {
  const allocLines = parseGroupAllocationLines(opts.allocation, {
    totalAmountMinor: opts.totalAmountMinor,
    memberIds: opts.selectedMemberIds,
  });
  const byId = new Map(allocLines.map((l) => [l.member_client_id, l.amount_minor]));
  const lines: MemberCashCollateralLine[] = [];
  for (const memberId of opts.selectedMemberIds) {
    const loanShare = byId.get(memberId) ?? 0;
    const cash = memberCashCollateralMinor(loanShare);
    lines.push({
      member_client_id: memberId,
      member_name: opts.memberNameById?.[memberId] ?? `Member #${memberId}`,
      loan_share_minor: loanShare,
      cash_collateral_minor: cash,
    });
  }
  const totalCashMinor = lines.reduce((s, l) => s + l.cash_collateral_minor, 0);
  return { lines, totalCashMinor };
}

export function defaultDescriptionForCollateralType(collateralType: string): string {
  if (isMemberCashCollateralType(collateralType)) return MEMBER_CASH_COLLATERAL_DESCRIPTION;
  if (isGroupMutualGuaranteeType(collateralType)) return GROUP_MUTUAL_GUARANTEE_DESCRIPTION;
  return '';
}
