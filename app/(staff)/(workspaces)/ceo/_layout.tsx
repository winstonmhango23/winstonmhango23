import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function CeoLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'CEO' }} />
      <Stack.Screen name="queue" options={{ title: 'CEO action queue' }} />
      <Stack.Screen name="gceo-escalations" options={{ title: 'GCEO escalations' }} />
      <Stack.Screen name="pending-release" options={{ title: 'Pending release' }} />
      <Stack.Screen name="repayments" options={{ title: 'Institution repayments' }} />
    </Stack>
  );
}
