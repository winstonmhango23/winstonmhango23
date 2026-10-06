import { ExecutiveRepaymentsScreen } from '@/components/leadership/executive-repayments-screen';
import { isCeoStaffRole, isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function CeoRepaymentsRoute() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCeoStaffRole(backendRole) ||
    isGceoStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['CEO', 'GCEO', 'ADMIN']);
  return <ExecutiveRepaymentsScreen allowed={allowed} audience="ceo" />;
}
