import type { UserRole } from '@/store/auth';

export type SyncPortal = 'staff' | 'client';

export function syncListHref(portal: SyncPortal): '/(staff)/sync' | '/(client)/sync' {
  return portal === 'staff' ? '/(staff)/sync' : '/(client)/sync';
}

export function syncDetailHref(
  portal: SyncPortal,
  id: number,
  kind: string
): `/(staff)/sync/${string}` | `/(client)/sync/${string}` {
  const base = portal === 'staff' ? '/(staff)/sync' : '/(client)/sync';
  return `${base}/${id}?kind=${encodeURIComponent(kind)}` as `/(staff)/sync/${string}`;
}

export function syncPortalForRole(role: UserRole | null | undefined): SyncPortal {
  return role === 'staff' ? 'staff' : 'client';
}
