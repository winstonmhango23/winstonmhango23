import { Stack } from 'expo-router';

import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function PropertiesMapLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
