import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function AuditLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Internal Auditor' }} />
      <Stack.Screen name="findings" options={{ title: 'Findings' }} />
      <Stack.Screen name="trail" options={{ title: 'Audit trail' }} />
      <Stack.Screen name="risk" options={{ title: 'Risk & compliance' }} />
      <Stack.Screen name="loan-performance" options={{ title: 'Loan performance' }} />
      <Stack.Screen name="statistics" options={{ title: 'Audit statistics' }} />
      <Stack.Screen name="clients" options={{ title: 'Client records' }} />
    </Stack>
  );
}
