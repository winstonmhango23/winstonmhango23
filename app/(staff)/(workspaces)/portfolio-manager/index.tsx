import { View } from 'react-native';

import { PortfolioManagerWorkspace } from '@/components/portfolio-manager/pm-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import {
  backendRoleMatches,
  desktopOnlyWorkspaceMessage,
} from '@/lib/navigation/role-workspace-gate';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function PortfolioManagerScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Portfolio Manager workspace"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <PortfolioManagerWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your PM workspace…" />
    </View>
  );
}
