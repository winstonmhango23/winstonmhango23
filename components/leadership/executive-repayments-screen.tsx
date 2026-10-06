import { useCallback, useEffect, useMemo, useState } from 'react';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import { RepaymentKpiStrip } from '@/components/staff/repayments/repayment-kpi-strip';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import {
  apiGetCeoRepaymentMetrics,
  apiGetCeoRepaymentsList,
  apiGetGceoRepaymentMetrics,
  apiGetGceoRepaymentsList,
  type ApiExecutiveRepaymentRow,
  type ApiRepaymentMetrics,
} from '@/lib/data/api';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { metricsToKpis, repaymentAmountMinor } from '@/lib/staff/repayment-flows';
import { getStoredAuth } from '@/lib/storage';

export function ExecutiveRepaymentsScreen({
  allowed,
  audience,
}: {
  allowed: boolean;
  audience: 'ceo' | 'gceo';
}) {
  const [rows, setRows] = useState<ApiExecutiveRepaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<ApiRepaymentMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [page, kpi] = await Promise.all([
        audience === 'gceo'
          ? apiGetGceoRepaymentsList(auth.token, { limit: 50 })
          : apiGetCeoRepaymentsList(auth.token, { limit: 50 }),
        audience === 'gceo'
          ? apiGetGceoRepaymentMetrics(auth.token)
          : apiGetCeoRepaymentMetrics(auth.token),
      ]);
      setRows(page.items);
      setTotal(page.total);
      setMetrics(kpi);
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const items = useMemo<RoleActionItem[]>(
    () =>
      rows.map((row, i) => ({
        id: String(row.repayment_id ?? row.id ?? i),
        title: row.client_name?.trim() || `Receipt #${row.repayment_id ?? row.id ?? i}`,
        subtitle: [row.branch_name, row.status, row.payment_method].filter(Boolean).join(' · '),
        meta: row.paid_at ? String(row.paid_at).slice(0, 10) : undefined,
        amountMinor: repaymentAmountMinor(row),
        loanId: row.loan_id,
      })),
    [rows]
  );

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Institution repayments"
        message={desktopOnlyWorkspaceMessage('Executive shell')}
      />
    );
  }

  return (
    <RoleActionList
      title={audience === 'gceo' ? 'Strategic repayments' : 'Institution repayments'}
      subtitle={`${total || items.length} receipt${(total || items.length) === 1 ? '' : 's'} across the institution`}
      emptyTitle="No repayment records"
      emptyMessage="Institutional receipts will appear here for executive oversight."
      items={items}
      loading={loading}
      onRefresh={load}
      openLabel="Open loan"
      header={<RepaymentKpiStrip items={metricsToKpis(metrics)} />}
    />
  );
}
