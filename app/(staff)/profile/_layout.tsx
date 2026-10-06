import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function StaffProfileLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
    </Stack>
  );
}
