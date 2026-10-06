import type { Href } from 'expo-router';

import type { ApiRepaymentMetrics, ApiRepaymentOverviewItem } from '@/lib/data/api';
import {
  isAccountantStaffRole,
  isCeoStaffRole,
  isCreditOfficerStaffRole,
  isGceoStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
} from '@/lib/loan-origination/origination-workflow';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

export type RepaymentKpi = {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'success' | 'accent';
};

export type DedicatedRepaymentFlow = {
  href: Href;
  title: string;
  hint: string;
};

export function sumOverviewDueMinor(items: ApiRepaymentOverviewItem[]): number {
  return items.reduce((sum, item) => sum + (item.next_due_amount ?? 0), 0);
}

export function sumOverviewOutstandingMinor(items: ApiRepaymentOverviewItem[]): number {
  return items.reduce((sum, item) => sum + (item.outstanding_principal ?? 0), 0);
}

export function liveTrackingCount(items: ApiRepaymentOverviewItem[]): number {
  return items.filter((item) => item.repayment_tracking_live === true).length;
}

export function repaymentStatusLabel(status?: string | null): string {
  if (!status) return 'Recorded';
  return status.replace(/_/g, ' ');
}

export function repaymentAmountMinor(row: {
  amount_minor?: number | null;
  total_amount?: number | null;
  amount?: number | null;
}): number | undefined {
  const value = row.amount_minor ?? row.total_amount ?? row.amount;
  return value == null ? undefined : Number(value);
}

export function staffRepaymentHubCopy(role?: string | null): { title: string; subtitle: string } {
  if (isAccountantStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Current and legacy books · pending GL finalization' };
  }
  if (isCreditOfficerStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Supervised collections across your book' };
  }
  if (isPortfolioManagerStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Portfolio ledger · expected dues and receipts' };
  }
  if (isOperationsAssistantStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Record repayments · current loans and legacy book' };
  }
  if (isOperationsOfficerStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Record repayments · current, legacy, and receipts' };
  }
  if (isOperationsManagerStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Record repayments · current, legacy, and escalations' };
  }
  if (isGceoStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Strategic collection oversight' };
  }
  if (isCeoStaffRole(role)) {
    return { title: 'Repayments', subtitle: 'Institution collection oversight' };
  }
  return { title: 'Repayments', subtitle: 'Field collections · pending ops confirmation' };
}

export function dedicatedStaffRepaymentFlow(role?: string | null): DedicatedRepaymentFlow | null {
  if (isAccountantStaffRole(role)) {
    return {
      href: '/(staff)/accountant/repayments' as Href,
      title: 'Accountant repayments',
      hint: 'Review current and legacy schedules, then post manager-approved receipts to the ledger',
    };
  }
  if (isCreditOfficerStaffRole(role)) {
    return {
      href: '/(staff)/cio/repayments' as Href,
      title: 'Supervised ledger',
      hint: 'Filter receipts by loan officer and open the loan file',
    };
  }
  if (isPortfolioManagerStaffRole(role)) {
    return {
      href: '/(staff)/portfolio-manager/repayments' as Href,
      title: 'Portfolio repayment ledger',
      hint: 'Branch receipts, collection rate, and CIO coverage',
    };
  }
  if (isOperationsAssistantStaffRole(role)) {
    return {
      href: '/(staff)/operations-assistant/repayments' as Href,
      title: 'Current and legacy repayments',
      hint: 'Record repayments on originated loans and the SME / Group legacy book',
    };
  }
  if (isOperationsOfficerStaffRole(role)) {
    return {
      href: '/(staff)/operations/repayments' as Href,
      title: 'Current and legacy repayments',
      hint: 'Record repayments, open schedules, then escalate receipts if needed',
    };
  }
  if (isOperationsManagerStaffRole(role)) {
    return {
      href: '/(staff)/operations/repayments' as Href,
      title: 'Current and legacy repayments',
      hint: 'Record repayments on current and legacy books, then review escalations',
    };
  }
  if (isGceoStaffRole(role)) {
    return {
      href: '/(staff)/gceo/repayments' as Href,
      title: 'Strategic repayments',
      hint: 'Institution receipts and collection KPIs',
    };
  }
  if (isCeoStaffRole(role)) {
    return {
      href: '/(staff)/ceo/repayments' as Href,
      title: 'Institution repayments',
      hint: 'Executive receipts and collection KPIs',
    };
  }
  return null;
}

export function metricsToKpis(metrics: ApiRepaymentMetrics | null | undefined): RepaymentKpi[] {
  return [
    {
      label: 'Receipts',
      value: String(metrics?.total_repayments ?? 0),
    },
    {
      label: 'Collected',
      value: formatMinorMWK(metrics?.total_amount_minor ?? 0),
      tone: 'success',
    },
    {
      label: 'Collection rate',
      value: `${Number(metrics?.collection_rate ?? 0).toFixed(0)}%`,
      tone: 'accent',
    },
    {
      label: 'Overdue',
      value: String(metrics?.overdue_repayment_count ?? 0),
      tone: (metrics?.overdue_repayment_count ?? 0) > 0 ? 'warning' : 'default',
    },
  ];
}

export function overviewToKpis(opts: {
  due: ApiRepaymentOverviewItem[];
  overdue: ApiRepaymentOverviewItem[];
  upcoming: ApiRepaymentOverviewItem[];
}): RepaymentKpi[] {
  return [
    {
      label: 'Due today',
      value: formatMinorMWK(sumOverviewDueMinor(opts.due)),
    },
    {
      label: 'Overdue',
      value: formatMinorMWK(sumOverviewDueMinor(opts.overdue)),
      tone: opts.overdue.length > 0 ? 'warning' : 'default',
    },
    {
      label: 'Upcoming',
      value: formatMinorMWK(sumOverviewDueMinor(opts.upcoming)),
    },
    {
      label: 'Live tracks',
      value: String(
        liveTrackingCount(opts.due) + liveTrackingCount(opts.overdue) + liveTrackingCount(opts.upcoming)
      ),
      tone: 'accent',
    },
  ];
}
