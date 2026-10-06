import { useLocalSearchParams } from 'expo-router';

import { OpsRepaymentRecordScreen } from '@/components/operations/ops-repayment-record-screen';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsManagerRepaymentRecordRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);

  return (
    <OpsRepaymentRecordScreen
      repaymentId={Number(id)}
      role="manager"
      allowed={allowed}
      gateTitle="Repayment record"
    />
  );
}
