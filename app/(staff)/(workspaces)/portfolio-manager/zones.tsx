import { ZoneDistrictManagement } from '@/components/portfolio-manager/zone-district-management';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function PmZonesScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Zone & district management"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return <ZoneDistrictManagement />;
}
