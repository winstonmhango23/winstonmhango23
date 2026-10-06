import { PendingReleaseScreen } from '@/components/leadership/pending-release-screen';
import { isCeoStaffRole, isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function CeoPendingReleaseRoute() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCeoStaffRole(backendRole) ||
    isGceoStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['CEO', 'GCEO', 'ADMIN']);
  return <PendingReleaseScreen allowed={allowed} />;
}
