import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { apiGetAccountantOperationsQueue, type RoleQueueApplication } from '@/lib/data/api';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function AccountantOpsHandoffScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAccountantStaffRole(backendRole) || backendRoleMatches(backendRole, ['ACCOUNTANT', 'ADMIN']);
  const router = useRouter();
  const [items, setItems] = useState<RoleQueueApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await apiGetAccountantOperationsQueue(auth.token, { limit: 50 });
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
        title="Operations handoff"
        message={desktopOnlyWorkspaceMessage('Accountant shell')}
      />
    );
  }

  return (
    <RoleApplicationQueue
      title="Operations handoff"
      subtitle={`${total} file${total === 1 ? '' : 's'} queued for the operations officer after disbursement`}
      emptyTitle="Handoff queue clear"
      emptyMessage="No funded applications are waiting for operations."
      items={items}
      loading={loading}
      onRefresh={load}
      onViewLoan={(loanId) => router.push(`/(staff)/loans/${loanId}`)}
    />
  );
}
