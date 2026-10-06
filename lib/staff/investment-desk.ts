import type { RoleActionItem } from '@/components/staff/role-action-list';
import type {
  ApiFundStatistics,
  ApiInvestmentAllocation,
  ApiInvestmentAllocationSummary,
  ApiInvestmentFund,
  ApiShareholder,
  ApiShareholderInvestment,
  ApiShareholderInvestmentStatistics,
  ApiShareholderStatistics,
} from '@/lib/data/api';
import { isCeoStaffRole, isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';

export function canAccessInvestmentDesk(role?: string | null): boolean {
  return (
    isCeoStaffRole(role) ||
    isGceoStaffRole(role) ||
    backendRoleMatches(role, ['CEO', 'GCEO', 'ADMIN'])
  );
}

export function unwrapInvestmentList<T>(
  payload: T[] | Record<string, unknown> | null | undefined,
  key: string
): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const list = payload[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

export function formatInvestmentLabel(value?: string | null): string {
  const trimmed = (value ?? '').replace(/_/g, ' ').trim();
  return trimmed || '—';
}

export function isPendingSubscription(status?: string | null): boolean {
  return (status ?? '').trim().toUpperCase() === 'PENDING';
}

export function fundToActionItem(fund: ApiInvestmentFund): RoleActionItem {
  const type = formatInvestmentLabel(fund.fund_type);
  const status = formatInvestmentLabel(fund.status);
  return {
    id: String(fund.id),
    title: fund.fund_name?.trim() || fund.fund_code?.trim() || `Fund #${fund.id}`,
    subtitle: [fund.fund_code, type, status].filter(Boolean).join(' · '),
    meta:
      fund.deployment_rate != null
        ? `Deployment ${Math.round(Number(fund.deployment_rate))}%`
        : undefined,
    amountMinor: fund.total_committed_cents ?? fund.target_size_cents ?? null,
  };
}

export function shareholderToActionItem(row: ApiShareholder): RoleActionItem {
  return {
    id: String(row.id),
    title: row.name?.trim() || `Shareholder #${row.id}`,
    subtitle: [formatInvestmentLabel(row.shareholder_type), row.country, row.email]
      .filter(Boolean)
      .join(' · '),
    meta:
      row.num_investments != null
        ? `${row.num_investments} investment${row.num_investments === 1 ? '' : 's'}`
        : undefined,
    amountMinor: row.total_commitment_cents ?? row.total_invested_cents ?? null,
  };
}

export function subscriptionToActionItem(row: ApiShareholderInvestment): RoleActionItem {
  return {
    id: String(row.id),
    title: row.shareholder_name?.trim() || `Subscription #${row.id}`,
    subtitle: [row.fund_name || row.fund_code, formatInvestmentLabel(row.investment_type)]
      .filter(Boolean)
      .join(' · '),
    meta: formatInvestmentLabel(row.approval_status),
    amountMinor: row.commitment_amount_cents ?? null,
  };
}

export function allocationToActionItem(row: ApiInvestmentAllocation): RoleActionItem {
  const scope = [formatInvestmentLabel(row.scope), formatInvestmentLabel(row.service_type)]
    .filter((part) => part !== '—')
    .join(' · ');
  return {
    id: String(row.id),
    title: row.fund_name?.trim() || `Allocation #${row.id}`,
    subtitle: [scope, row.branch_name].filter(Boolean).join(' · '),
    meta: row.is_active === false ? 'Inactive' : 'Active',
    amountMinor: row.allocated_amount_minor ?? null,
  };
}

export type InvestmentOverviewKpi = {
  label: string;
  value: string;
};

export function investmentOverviewKpis(input: {
  funds?: ApiFundStatistics | null;
  shareholders?: ApiShareholderStatistics | null;
  subscriptions?: ApiShareholderInvestmentStatistics | null;
  allocations?: ApiInvestmentAllocationSummary | null;
}): InvestmentOverviewKpi[] {
  return [
    { label: 'Funds', value: String(input.funds?.total_funds ?? 0) },
    { label: 'AUM', value: formatMinorMWK(input.funds?.total_aum_cents ?? 0) },
    { label: 'Shareholders', value: String(input.shareholders?.total_shareholders ?? 0) },
    { label: 'Subscriptions', value: String(input.subscriptions?.total_investments ?? 0) },
    { label: 'Allocated', value: formatMinorMWK(input.allocations?.total_allocated_minor ?? 0) },
    {
      label: 'Unallocated',
      value: formatMinorMWK(input.allocations?.total_unallocated_minor ?? 0),
    },
  ];
}
