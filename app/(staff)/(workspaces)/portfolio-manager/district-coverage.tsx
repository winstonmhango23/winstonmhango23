import { DistrictCoverage } from '@/components/portfolio-manager/district-coverage';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function PmDistrictCoverageScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="District coverage"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return <DistrictCoverage />;
}