import { Stack } from 'expo-router';

import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function LoanDetailLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Loan detail' }} />
      <Stack.Screen name="collateral" options={{ title: 'Collateral' }} />
      <Stack.Screen name="guarantors" options={{ title: 'Guarantors' }} />
      <Stack.Screen name="penalties" options={{ title: 'Penalties' }} />
      <Stack.Screen name="waivers" options={{ title: 'Waivers' }} />
      <Stack.Screen name="documents" options={{ title: 'Documents' }} />
      <Stack.Screen name="notes" options={{ title: 'Notes' }} />
      <Stack.Screen name="workout" options={{ title: 'Workout' }} />
    </Stack>
  );
}
