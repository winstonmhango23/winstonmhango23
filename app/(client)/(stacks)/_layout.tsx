import { Stack } from 'expo-router';

import { CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS } from '@/constants/client-tabs';
import { useHideParentTabBarWhenActive } from '@/hooks/use-tab-bar-visibility';

/** Borrower stack-only flows (sync detail, KYC, property, group members) — never tab screens. */
export default function ClientStacksLayout() {
  useHideParentTabBarWhenActive(CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS);
  return <Stack screenOptions={{ headerShown: false }} />;
}
