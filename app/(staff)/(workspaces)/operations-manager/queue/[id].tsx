import { useLocalSearchParams } from 'expo-router';

import { OpsQueueDetailScreen } from '@/components/operations/ops-queue-detail-screen';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsManagerQueueDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);

  return (
    <OpsQueueDetailScreen
      applicationId={Number(id)}
      allowed={allowed}
      gateTitle="Queued loan"
      readOnly
      useManagerApi
    />
  );
}
