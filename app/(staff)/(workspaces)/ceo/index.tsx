import { View } from 'react-native';

import { CeoWorkspace, GceoWorkspace } from '@/components/leadership/executive-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { isCeoStaffRole, isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function CeoScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCeoStaffRole(backendRole) ||
    isGceoStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['CEO', 'GCEO', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="CEO workspace"
        message={desktopOnlyWorkspaceMessage('CEO executive shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isGceoStaffRole(backendRole) ? <GceoWorkspace /> : <CeoWorkspace />}
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your executive workspace…" />
    </View>
  );
}
