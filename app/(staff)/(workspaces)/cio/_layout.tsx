import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function CioLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'CIO Dashboard' }} />
      <Stack.Screen name="repayments" options={{ title: 'Supervised repayments' }} />
      <Stack.Screen name="supervised-loans" options={{ title: 'Supervised loans' }} />
    </Stack>
  );
}
