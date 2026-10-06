import { Stack } from 'expo-router';

import { ClientUI } from '@/constants/client-ui';
import { useHideTabBarOnChildRoute } from '@/hooks/use-tab-bar-visibility';

export default function LoansLayout() {
  useHideTabBarOnChildRoute('loans');
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { flex: 1, backgroundColor: ClientUI.colors.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
