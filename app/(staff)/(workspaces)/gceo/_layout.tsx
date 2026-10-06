import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function GceoLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'GCEO' }} />
      <Stack.Screen name="queue" options={{ title: 'GCEO action queue' }} />
      <Stack.Screen name="ceo-pipeline" options={{ title: 'CEO pipeline' }} />
      <Stack.Screen name="pending-release" options={{ title: 'Pending release' }} />
      <Stack.Screen name="repayments" options={{ title: 'Strategic repayments' }} />
    </Stack>
  );
}
