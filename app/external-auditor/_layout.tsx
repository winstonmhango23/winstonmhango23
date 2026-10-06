import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function ExternalAuditorLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="login" options={{ title: 'External auditor', headerShown: false }} />
      <Stack.Screen name="index" options={{ title: 'External auditor' }} />
      <Stack.Screen name="loans" options={{ title: 'Loan performance' }} />
      <Stack.Screen name="risk" options={{ title: 'Risk & compliance' }} />
      <Stack.Screen name="clients" options={{ title: 'Client records' }} />
    </Stack>
  );
}
