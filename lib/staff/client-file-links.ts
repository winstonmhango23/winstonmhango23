import type { Href, Router } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Canonical staff routes for a client file.
 * Same borrower record for LO, CIO, and other staff who can open that client.
 */
export type StaffClientHrefOptions = {
  returnTo?: string | null;
};

function withReturnTo(path: string, options?: StaffClientHrefOptions): Href {
  const returnTo = options?.returnTo ? String(options.returnTo).trim() : '';
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('://')) {
    return path as Href;
  }
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}returnTo=${encodeURIComponent(returnTo)}` as Href;
}

export function staffClientProfileHref(
  clientId: number | string,
  options?: StaffClientHrefOptions
): Href {
  return withReturnTo(`/(staff)/clients/${clientId}`, options);
}

export function staffClientKycHref(
  clientId: number | string,
  options?: StaffClientHrefOptions
): Href {
  return withReturnTo(`/(staff)/clients/${clientId}/edit-kyc`, options);
}

export function staffClientDocumentsHref(
  clientId: number | string,
  options?: StaffClientHrefOptions
): Href {
  return withReturnTo(`/(staff)/clients/${clientId}/documents`, options);
}

/**
 * Open a staff client file without replacing the current loan/application
 * screen. Native stacks the route (back returns to the loan). Web opens a tab.
 */
export function openStaffClientHref(router: Router, href: Href): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const path = typeof href === 'string' ? href : String(href);
    window.open(path, '_blank', 'noopener,noreferrer');
    return;
  }
  router.push(href);
}
