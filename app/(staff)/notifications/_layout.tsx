import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function StaffNotificationsLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Notifications' }} />
      <Stack.Screen name="[id]" options={{ title: 'Notification Details' }} />
    </Stack>
  );
}
