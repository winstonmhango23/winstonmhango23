import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function OperationsLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Operations' }} />
      <Stack.Screen name="ops-queue" options={{ title: 'Ops handoff' }} />
      <Stack.Screen name="disbursements" options={{ title: 'Disbursements' }} />
      <Stack.Screen name="repayments" options={{ title: 'Ops repayments' }} />
      <Stack.Screen name="repayment/[id]" options={{ title: 'Repayment record' }} />
      <Stack.Screen name="queue/[id]" options={{ title: 'Queued loan' }} />
    </Stack>
  );
}
