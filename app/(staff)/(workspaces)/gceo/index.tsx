import { View } from 'react-native';

import { GceoWorkspace } from '@/components/leadership/executive-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function GceoScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = isGceoStaffRole(backendRole) || backendRoleMatches(backendRole, ['GCEO', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="GCEO workspace"
        message={desktopOnlyWorkspaceMessage('GCEO executive shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <GceoWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your GCEO workspace…" />
    </View>
  );
}
