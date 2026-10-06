import { PendingReleaseScreen } from '@/components/leadership/pending-release-screen';
import { isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function GceoPendingReleaseRoute() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = isGceoStaffRole(backendRole) || backendRoleMatches(backendRole, ['GCEO', 'ADMIN']);
  return <PendingReleaseScreen allowed={allowed} />;
}
