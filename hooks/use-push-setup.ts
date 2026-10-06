/**
 * Hook to setup push notifications when user is logged in.
 * Call from (client) and (staff) layouts.
 */

import { useEffect } from 'react';

import { isPushNotificationsAvailable, setupPushNotifications } from '@/lib/notifications';
import { useProfileStore } from '@/store/profile';

export function usePushSetup(): void {
  const pushNotifications = useProfileStore((s) => s.pushNotifications);

  useEffect(() => {
    if (!isPushNotificationsAvailable()) return;
    setupPushNotifications(pushNotifications);
  }, [pushNotifications]);
}
