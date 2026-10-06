import { Stack } from 'expo-router';

import { staffStackScreenOptions } from '@/constants/staff-navigation';

/** Hidden stack — property detail is pushed here, not a tab. */
export default function StaffPropertyLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
