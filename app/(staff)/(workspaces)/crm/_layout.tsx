import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function CrmLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'CRM' }} />
    </Stack>
  );
}
