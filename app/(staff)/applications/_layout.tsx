import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function StaffApplicationsLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Applications' }} />
      <Stack.Screen name="[id]" options={{ title: 'Application Details' }} />
    </Stack>
  );
}
