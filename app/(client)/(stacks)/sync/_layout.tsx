import { Stack } from 'expo-router';

import { CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS } from '@/constants/client-tabs';
import { useHideParentTabBarWhenActive } from '@/hooks/use-tab-bar-visibility';

/** Hidden stack — sync list + item detail (not a tab). */
export default function ClientSyncLayout() {
  useHideParentTabBarWhenActive(CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
