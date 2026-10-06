import { View } from 'react-native';

import { OperationsAssistantWorkspace } from '@/components/operations/operations-assistant-workspace';
import { OperationsManagerWorkspace } from '@/components/operations/operations-manager-workspace';
import { OperationsOfficerWorkspace } from '@/components/operations/operations-officer-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import {
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
} from '@/lib/loan-origination/origination-workflow';
import {
  backendRoleMatches,
  desktopOnlyWorkspaceMessage,
} from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function OperationsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsOfficerStaffRole(backendRole) ||
    isOperationsManagerStaffRole(backendRole) ||
    isOperationsAssistantStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Operations workspace"
        message={desktopOnlyWorkspaceMessage('Operations shell')}
      />
    );
  }

  const Workspace = isOperationsManagerStaffRole(backendRole)
    ? OperationsManagerWorkspace
    : isOperationsAssistantStaffRole(backendRole)
      ? OperationsAssistantWorkspace
      : OperationsOfficerWorkspace;

  return (
    <View style={{ flex: 1 }}>
      <Workspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your operations workspace…" />
    </View>
  );
}
