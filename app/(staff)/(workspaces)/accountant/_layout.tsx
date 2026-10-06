import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function AccountantLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Accountant' }} />
      <Stack.Screen name="ready-to-disburse" options={{ title: 'Ready to disburse' }} />
      <Stack.Screen name="ops-handoff" options={{ title: 'Operations handoff' }} />
      <Stack.Screen name="disbursements" options={{ title: 'Disbursements' }} />
      <Stack.Screen name="journals" options={{ title: 'Legacy Booking' }} />
      <Stack.Screen name="repayments" options={{ title: 'Repayments' }} />
    </Stack>
  );
}
