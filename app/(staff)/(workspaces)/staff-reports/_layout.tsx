import { Stack } from 'expo-router';

export default function StaffReportsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Staff reports' }} />
      <Stack.Screen name="[id]" options={{ title: 'Report detail' }} />
    </Stack>
  );
}
