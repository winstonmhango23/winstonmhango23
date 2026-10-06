/**
 * Shared parse / photo helpers for staff group-member allocation lists.
 */

export type GroupAllocationData = Record<string, unknown>;

export type GroupAllocationMemberInfo = {
  name?: string;
  idPhotoPath?: string | null;
  profilePhotoPath?: string | null;
};

export type AllocationLine = {
  member_client_id: number;
  amount_minor: number;
};

export function hasDisplayableAllocation(
  allocation: GroupAllocationData | null | undefined
): boolean {
  if (!allocation || typeof allocation !== 'object') return false;
  if (Array.isArray(allocation.member_client_ids) && allocation.member_client_ids.length > 0) {
    return true;
  }
  if (Array.isArray(allocation.lines) && allocation.lines.length > 0) return true;
  return Object.keys(allocation).some((k) => /^\d+$/.test(k));
}

export function parseAllocation(allocation: GroupAllocationData | null | undefined): {
  mode: string;
  memberIds: number[];
  lines: AllocationLine[];
} | null {
  if (!hasDisplayableAllocation(allocation) || !allocation) return null;

  const mode = String(allocation.mode ?? 'custom');
  const memberIds = Array.isArray(allocation.member_client_ids)
    ? (allocation.member_client_ids as number[]).filter((id) => Number.isFinite(id))
    : [];

  let lines: AllocationLine[] = [];
  if (Array.isArray(allocation.lines)) {
    lines = (allocation.lines as AllocationLine[]).filter(
      (l) => l && Number.isFinite(l.member_client_id) && Number.isFinite(l.amount_minor)
    );
  } else {
    for (const [key, val] of Object.entries(allocation)) {
      if (!/^\d+$/.test(key)) continue;
      const entry = val as { amount_minor?: number } | number | undefined;
      const minor =
        typeof entry === 'number'
          ? entry
          : typeof entry === 'object' && entry?.amount_minor != null
            ? entry.amount_minor
            : null;
      if (minor != null && Number.isFinite(minor)) {
        lines.push({ member_client_id: Number(key), amount_minor: minor });
      }
    }
  }

  if (memberIds.length === 0 && lines.length === 0) return null;
  return { mode, memberIds, lines };
}

/** Prefer the ID photo; fall back to the face photo, matching the dashboard. */
export function memberPhotoPath(
  row: GroupAllocationMemberInfo | null | undefined
): string | null {
  const id = row?.idPhotoPath?.trim();
  if (id) return id;
  const face = row?.profilePhotoPath?.trim();
  return face || null;
}

export function resolveAllocationMemberIds(
  allocation: GroupAllocationData | null | undefined,
  fallbackMemberIds?: number[]
): number[] {
  const parsed = parseAllocation(allocation);
  if (parsed) {
    return parsed.memberIds.length > 0
      ? parsed.memberIds
      : parsed.lines.map((l) => l.member_client_id);
  }
  return (fallbackMemberIds ?? []).filter((id) => Number.isFinite(id) && id > 0);
}
