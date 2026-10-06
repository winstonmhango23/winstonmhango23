/**
 * Keep client and staff portals isolated — wrong-role sessions bounce to the correct home.
 */

import type { Href } from 'expo-router';

import type { UserRole } from '@/store/auth';

export function portalHomeForRole(role: UserRole): Href {
  return role === 'client' ? '/(client)' : '/(staff)';
}

export function isRoleAllowedInPortal(
  role: UserRole | null | undefined,
  portal: UserRole
): boolean {
  return role === portal;
}
