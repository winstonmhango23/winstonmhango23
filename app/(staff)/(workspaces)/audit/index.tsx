import { View } from 'react-native';

import { AuditorWorkspace } from '@/components/auditor/auditor-workspace';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { isAuditorStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function AuditScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAuditorStaffRole(backendRole) || backendRoleMatches(backendRole, ['AUDITOR', 'ADMIN']);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Auditor workspace"
        message={desktopOnlyWorkspaceMessage('Internal auditor shell')}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AuditorWorkspace />
      <HomeBootstrapOverlay visible={!staffReady} label="Loading your auditor workspace…" />
    </View>
  );
}
