import { Stack } from 'expo-router';

import { useHideTabBarOnChildRoute } from '@/hooks/use-tab-bar-visibility';

export default function ClientNotificationsLayout() {
  useHideTabBarOnChildRoute('notifications');
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
