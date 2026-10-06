import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function OperationsManagerLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Operations Manager' }} />
      <Stack.Screen name="handoff" options={{ title: 'Repayment handoff' }} />
      <Stack.Screen name="credit-queue" options={{ title: 'Credit queue' }} />
      <Stack.Screen name="escalated-repayments" options={{ title: 'Escalated repayments' }} />
      <Stack.Screen name="executive" options={{ title: 'Executive pipeline' }} />
      <Stack.Screen name="repayment/[id]" options={{ title: 'Repayment record' }} />
      <Stack.Screen name="queue/[id]" options={{ title: 'Queued loan' }} />
    </Stack>
  );
}
