import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

/**
 * Compact phones hide Profile from the tab bar (it clips). Put Profile in the
 * header instead. Notifications stay in the tab bar, so the header no longer
 * duplicates the Alerts bell.
 */
export function useClientHeaderTrailing(): {
  showProfile: boolean;
  showNotifications: boolean;
} {
  const { isCompactPhone } = useResponsiveLayout();
  return {
    showProfile: isCompactPhone,
    showNotifications: false,
  };
}
