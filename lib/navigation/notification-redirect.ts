/**
 * Map backend action_url + metadata to in-app routes (staff vs client).
 */

import type { Href } from 'expo-router';
import { staffClientProfileHref } from '@/lib/staff/client-file-links';

export type ResolvedNotificationNav =
  | { screen: 'none' }
  | { screen: 'external'; url: string }
  | { screen: 'staff_application'; applicationId: number }
  | { screen: 'staff_loan'; loanId: number }
  | { screen: 'staff_client'; clientId: number }
  | { screen: 'staff_repayment'; repaymentId: number }
  | { screen: 'client_application'; applicationId: number }
  | { screen: 'client_loan'; loanId: number };

function firstInt(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? undefined : n;
}

function pathFromUrl(actionUrl: string): string {
  try {
    if (actionUrl.startsWith('http')) {
      const u = new URL(actionUrl);
      return u.pathname || '';
    }
  } catch {
    /* fall through */
  }
  return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
}

function metaId(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  if (!meta || meta[key] == null) return undefined;
  const v = meta[key];
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') return firstInt(v);
  return undefined;
}

/** Resolve staff notification deep link (action_url from cofi-bms staff notifications). */
export function resolveStaffNotificationNav(
  actionUrl?: string | null,
  metadata?: Record<string, unknown> | null
): ResolvedNotificationNav {
  const appId = metaId(metadata, 'application_id');
  const loanId = metaId(metadata, 'loan_id');
  const clientId = metaId(metadata, 'client_id');
  const repaymentId = metaId(metadata, 'repayment_id');

  if (!actionUrl || !String(actionUrl).trim()) {
    if (appId != null) return { screen: 'staff_application', applicationId: appId };
    if (loanId != null) return { screen: 'staff_loan', loanId };
    if (clientId != null) return { screen: 'staff_client', clientId };
    if (repaymentId != null) return { screen: 'staff_repayment', repaymentId };
    return { screen: 'none' };
  }

  const raw = String(actionUrl).trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return { screen: 'external', url: raw };
  }

  const p = pathFromUrl(raw);

  let m = p.match(/\/loans\/applications\/(\d+)/i);
  if (m) return { screen: 'staff_application', applicationId: parseInt(m[1], 10) };

  m = p.match(/\/applications\/(\d+)/i);
  if (m) return { screen: 'staff_application', applicationId: parseInt(m[1], 10) };

  m = p.match(/\/loans\/(\d+)(?:\/|$)/i);
  if (m && !p.includes('applications')) return { screen: 'staff_loan', loanId: parseInt(m[1], 10) };

  m = p.match(/\/clients\/(\d+)/i);
  if (m) return { screen: 'staff_client', clientId: parseInt(m[1], 10) };

  m = p.match(/\/repayments\/(\d+)/i);
  if (m) return { screen: 'staff_repayment', repaymentId: parseInt(m[1], 10) };

  if (appId != null) return { screen: 'staff_application', applicationId: appId };
  if (loanId != null) return { screen: 'staff_loan', loanId };
  if (clientId != null) return { screen: 'staff_client', clientId };

  return { screen: 'none' };
}

/** Resolve customer portal notification targets for the client app. */
export function resolveClientNotificationNav(actionUrl?: string | null): ResolvedNotificationNav {
  if (!actionUrl || !String(actionUrl).trim()) return { screen: 'none' };
  const raw = String(actionUrl).trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return { screen: 'external', url: raw };
  }
  const p = pathFromUrl(raw);

  let m = p.match(/\/(?:loans\/)?applications\/(\d+)/i);
  if (m) return { screen: 'client_application', applicationId: parseInt(m[1], 10) };

  m = p.match(/\/loans\/(\d+)/i);
  if (m) return { screen: 'client_loan', loanId: parseInt(m[1], 10) };

  m = p.match(/loan[_-]?id[=:](\d+)/i);
  if (m) return { screen: 'client_loan', loanId: parseInt(m[1], 10) };

  return { screen: 'none' };
}

export function resolvedNavToHref(nav: ResolvedNotificationNav): Href | null {
  switch (nav.screen) {
    case 'staff_application':
      return `/(staff)/applications/${nav.applicationId}` as Href;
    case 'staff_loan':
      return `/(staff)/loans/${nav.loanId}` as Href;
    case 'staff_client':
      return staffClientProfileHref(nav.clientId);
    case 'staff_repayment':
      return `/(staff)/repayments/${nav.repaymentId}` as Href;
    case 'client_application':
      return `/(client)/applications?openApplicationId=${nav.applicationId}` as Href;
    case 'client_loan':
      return `/(client)/loans/${nav.loanId}` as Href;
    default:
      return null;
  }
}
