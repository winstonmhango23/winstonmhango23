import { isCreditOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { isolateCreditBook } from '@/lib/staff/loan-book-filters';
import { scopedGetItemOptional, scopedSetItem } from '@/lib/account-scope';
import type { ApiCioDashboard } from '@/lib/data/api';

const DASHBOARD_KEY = 'cio_dashboard_snapshot';

export function staffListFetchOpts(user?: {
  backendRole?: string | null;
  role?: string | null;
  creditBook?: string | null;
} | null): { supervisedOnly?: boolean; creditBook?: string } {
  if (!isCreditOfficerStaffRole(user?.backendRole ?? user?.role)) return {};
  const creditBook = isolateCreditBook(user?.creditBook);
  return {
    supervisedOnly: true,
    creditBook: creditBook || undefined,
  };
}

export async function readCioDashboardCache(): Promise<ApiCioDashboard | null> {
  try {
    const raw = await scopedGetItemOptional(DASHBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: ApiCioDashboard };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export async function writeCioDashboardCache(data: ApiCioDashboard): Promise<void> {
  try {
    await scopedSetItem(
      DASHBOARD_KEY,
      JSON.stringify({ data, cached_at: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}
