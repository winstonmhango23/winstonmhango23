import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function ClientIdLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Edit Client' }} />
      <Stack.Screen name="edit-kyc" options={{ title: 'Edit KYC' }} />
      <Stack.Screen name="members" options={{ title: 'Group members' }} />
      <Stack.Screen name="add-member" options={{ title: 'Add member' }} />
      <Stack.Screen name="leaders" options={{ title: 'Group leaders' }} />
      <Stack.Screen name="documents" options={{ title: 'Documents' }} />
      <Stack.Screen name="accounts" options={{ title: 'Client accounts' }} />
      <Stack.Screen name="guarantors" options={{ title: 'Client guarantors' }} />
      <Stack.Screen name="collateral-vault" options={{ title: 'Collateral Vault' }} />
    </Stack>
  );
}
