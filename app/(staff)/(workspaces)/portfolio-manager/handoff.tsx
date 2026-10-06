import { useCallback, useEffect, useState } from 'react';

import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { apiGetPortfolioManagerHandoffQueue, type RoleQueueApplication } from '@/lib/data/api';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function PmHandoffScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);
  const [items, setItems] = useState<RoleQueueApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await apiGetPortfolioManagerHandoffQueue(auth.token, { limit: 50 });
      setItems(page.items);
      setTotal(page.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Repayment handoff"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return (
    <RoleApplicationQueue
      title="Repayment handoff"
      subtitle={`${total} OPS_PENDING_MANAGER file${total === 1 ? '' : 's'} — acknowledgement is operations-manager only`}
      emptyTitle="No handoff waiting"
      emptyMessage="Operations manager has no repayment-tracking files awaiting acknowledgement."
      items={items}
      loading={loading}
      onRefresh={load}
    />
  );
}
