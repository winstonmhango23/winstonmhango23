import { useCallback, useEffect, useState } from 'react';

import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { apiGetPortfolioManagerQueue, type RoleQueueApplication } from '@/lib/data/api';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function PmApprovalsScreen() {
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
      const page = await apiGetPortfolioManagerQueue(auth.token, { limit: 50 });
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
title="Approvals"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return (
    <RoleApplicationQueue
      title="Approvals"
      subtitle={`${total} CIO-verified file${total === 1 ? '' : 's'} awaiting PM decision`}
      emptyTitle="Queue clear"
      emptyMessage="No applications are waiting for portfolio manager approval."
      items={items}
      loading={loading}
      onRefresh={load}
      actionLabel="Review and escalate"
    />
  );
}
