import { ExecutiveRepaymentsScreen } from '@/components/leadership/executive-repayments-screen';
import { isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function GceoRepaymentsRoute() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = isGceoStaffRole(backendRole) || backendRoleMatches(backendRole, ['GCEO', 'ADMIN']);
  return <ExecutiveRepaymentsScreen allowed={allowed} audience="gceo" />;
}
