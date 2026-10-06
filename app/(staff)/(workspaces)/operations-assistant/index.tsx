import { View } from 'react-native';

import { OperationsAssistantWorkspace } from '@/components/operations/operations-assistant-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { isOperationsAssistantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function OperationsAssistantScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsAssistantStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_ASSISTANT', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Operations Assistant workspace"
        message={desktopOnlyWorkspaceMessage('Operations Assistant shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OperationsAssistantWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your operations assistant workspace…" />
    </View>
  );
}
