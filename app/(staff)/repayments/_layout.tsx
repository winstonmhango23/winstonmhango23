import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function StaffRepaymentsLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Repayments' }} />
      <Stack.Screen name="[id]" options={{ title: 'Repayment Details' }} />
    </Stack>
  );
}
