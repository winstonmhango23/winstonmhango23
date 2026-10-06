import { useLocalSearchParams } from 'expo-router';

import { OpsRepaymentRecordScreen } from '@/components/operations/ops-repayment-record-screen';
import {
  isAccountantStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsOfficerStaffRole,
} from '@/lib/loan-origination/origination-workflow';
import { opsRepaymentRoleFromBackend } from '@/lib/ops-records';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsRepaymentRecordRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsOfficerStaffRole(backendRole) ||
    isOperationsAssistantStaffRole(backendRole) ||
    isAccountantStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_OFFICER', 'OPERATIONS_ASSISTANT', 'ACCOUNTANT', 'ADMIN']);
  const role = opsRepaymentRoleFromBackend(backendRole) ?? 'officer';

  return (
    <OpsRepaymentRecordScreen
      repaymentId={Number(id)}
      role={role === 'manager' ? 'officer' : role}
      allowed={allowed}
      gateTitle="Repayment record"
    />
  );
}
