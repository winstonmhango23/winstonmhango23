import { Stack } from 'expo-router';

import { STAFF_TAB_BAR_HIDE_SEGMENTS } from '@/constants/staff-tabs';
import { useHideParentTabBarWhenActive } from '@/hooks/use-tab-bar-visibility';

export default function SyncLayout() {
  useHideParentTabBarWhenActive(STAFF_TAB_BAR_HIDE_SEGMENTS);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
