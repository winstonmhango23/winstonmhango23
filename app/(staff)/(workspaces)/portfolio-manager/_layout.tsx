import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function PortfolioManagerLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Portfolio Manager' }} />
      <Stack.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Stack.Screen name="drawdowns/index" options={{ title: 'Loan drawdowns' }} />
      <Stack.Screen name="drawdowns/[applicationId]" options={{ title: 'Drawdown editor' }} />
      <Stack.Screen name="cio-backlog" options={{ title: 'CIO backlog' }} />
      <Stack.Screen name="executive" options={{ title: 'Executive pipeline' }} />
      <Stack.Screen name="handoff" options={{ title: 'Repayment handoff' }} />
      <Stack.Screen name="repayments" options={{ title: 'Portfolio repayments' }} />
      <Stack.Screen name="zones" options={{ title: 'Zones & districts' }} />
      <Stack.Screen name="district-coverage" options={{ title: 'District coverage' }} />
    </Stack>
  );
}
