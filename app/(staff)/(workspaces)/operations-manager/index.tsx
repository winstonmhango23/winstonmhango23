import { View } from 'react-native';

import { OperationsManagerWorkspace } from '@/components/operations/operations-manager-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function OperationsManagerScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Operations Manager workspace"
        message={desktopOnlyWorkspaceMessage('Operations Manager shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OperationsManagerWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your operations manager workspace…" />
    </View>
  );
}
