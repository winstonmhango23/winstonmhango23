import { useLocalSearchParams } from 'expo-router';

import { OpsQueueDetailScreen } from '@/components/operations/ops-queue-detail-screen';
import { isOperationsManagerStaffRole, isOperationsOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsQueueDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const isManager = isOperationsManagerStaffRole(backendRole);
  const allowed =
    isOperationsOfficerStaffRole(backendRole) ||
    isManager ||
    backendRoleMatches(backendRole, ['OPERATIONS_OFFICER', 'OPERATIONS_MANAGER', 'ADMIN']);

  return (
    <OpsQueueDetailScreen
      applicationId={Number(id)}
      allowed={allowed}
      gateTitle="Queued loan"
      readOnly={isManager}
      useManagerApi={isManager}
    />
  );
}
