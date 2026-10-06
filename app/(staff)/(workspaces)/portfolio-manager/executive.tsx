import { useCallback, useEffect, useState } from 'react';

import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { apiGetPortfolioManagerExecutivePipeline, type RoleQueueApplication } from '@/lib/data/api';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function PmExecutivePipelineScreen() {
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
      const page = await apiGetPortfolioManagerExecutivePipeline(auth.token, { limit: 50 });
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
        title="Executive pipeline"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return (
    <RoleApplicationQueue
      title="Executive pipeline"
      subtitle={`${total} file${total === 1 ? '' : 's'} with CEO or GCEO`}
      emptyTitle="No executive files"
      emptyMessage="Nothing is waiting with the CEO or General CEO."
      items={items}
      loading={loading}
      onRefresh={load}
    />
  );
}
