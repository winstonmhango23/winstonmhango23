import { View } from 'react-native';

import { CioWorkspace } from '@/components/cio/cio-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { isCreditOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function CioScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCreditOfficerStaffRole(backendRole) || backendRoleMatches(backendRole, ['CIO', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="CIO workspace"
        message={desktopOnlyWorkspaceMessage('CIO shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CioWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your CIO workspace…" />
    </View>
  );
}
