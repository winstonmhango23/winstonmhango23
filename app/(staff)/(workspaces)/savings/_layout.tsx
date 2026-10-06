import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function SavingsLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Savings' }} />
      <Stack.Screen name="deposit" options={{ title: 'New Deposit' }} />
      <Stack.Screen name="withdrawal" options={{ title: 'New Withdrawal' }} />
    </Stack>
  );
}
