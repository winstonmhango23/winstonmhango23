import { View } from 'react-native';

import { AccountantWorkspace } from '@/components/accountant/accountant-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import {
  backendRoleMatches,
  desktopOnlyWorkspaceMessage,
} from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function AccountantDashboardScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAccountantStaffRole(backendRole) || backendRoleMatches(backendRole, ['ACCOUNTANT', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Accountant workspace"
        message={desktopOnlyWorkspaceMessage('Accountant shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AccountantWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your accountant workspace…" />
    </View>
  );
}
