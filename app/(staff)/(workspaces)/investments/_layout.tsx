import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function InvestmentsLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Investment Overview' }} />
      <Stack.Screen name="funds" options={{ title: 'Investment Funds' }} />
      <Stack.Screen name="shareholders" options={{ title: 'Shareholders' }} />
      <Stack.Screen name="subscriptions" options={{ title: 'Investments' }} />
      <Stack.Screen name="allocations" options={{ title: 'Capital allocation' }} />
    </Stack>
  );
}
