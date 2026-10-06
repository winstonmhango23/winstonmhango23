import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function ComplianceLayout() {
  return (
    <Stack
      screenOptions={staffStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: 'Compliance' }} />
      <Stack.Screen name="cases" options={{ title: 'Compliance Cases' }} />
      <Stack.Screen name="kyc-queue" options={{ title: 'KYC Queue' }} />
      <Stack.Screen name="kyc" options={{ title: 'KYC Detail' }} />
    </Stack>
  );
}
