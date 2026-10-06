import { Stack } from 'expo-router';

import { CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS } from '@/constants/client-tabs';
import { useHideParentTabBarWhenActive, useHideTabBarOnChildRoute } from '@/hooks/use-tab-bar-visibility';

export default function GroupMembersLayout() {
  useHideParentTabBarWhenActive(CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS);
  useHideTabBarOnChildRoute('group-members');
  return <Stack screenOptions={{ headerShown: false }} />;
}
