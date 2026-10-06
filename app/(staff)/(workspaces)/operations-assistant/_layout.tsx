import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function OperationsAssistantLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Operations Assistant' }} />
      <Stack.Screen name="reviews" options={{ title: 'Loan reviews' }} />
      <Stack.Screen name="repayments" options={{ title: 'Repayments' }} />
    </Stack>
  );
}
