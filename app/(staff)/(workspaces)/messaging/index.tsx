import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';

/** Messaging product is notifications-clone only — use Notifications tab + web /messaging. */
export default function MessagingScreen() {
  return (
    <DesktopOnlyWorkspace
      title="Messaging is on web BMS"
      message={`${desktopOnlyWorkspaceMessage('Staff messaging')} Use the Notifications tab for digests and alerts.`}
    />
  );
}
