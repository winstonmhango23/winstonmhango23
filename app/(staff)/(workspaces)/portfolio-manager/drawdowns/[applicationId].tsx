import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { PmDrawdownEditor } from '@/components/portfolio-manager/pm-drawdown-editor';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function PmDrawdownEditorScreen() {
  const { applicationId } = useLocalSearchParams<{ applicationId?: string }>();
  const appId = useMemo(() => Number(applicationId), [applicationId]);
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Loan drawdown"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return <PmDrawdownEditor applicationId={appId} />;
}
