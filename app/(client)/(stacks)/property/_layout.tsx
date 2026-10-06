import { Stack } from 'expo-router';

import { CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS } from '@/constants/client-tabs';
import { useHideParentTabBarWhenActive } from '@/hooks/use-tab-bar-visibility';

/** Hidden stack — property detail is pushed here, not a tab. */
export default function ClientPropertyLayout() {
  useHideParentTabBarWhenActive(CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
