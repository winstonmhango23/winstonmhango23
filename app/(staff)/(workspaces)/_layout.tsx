import { Stack } from 'expo-router';

/** Executive / back-office routes — not tab screens (keeps CEO/CIO off the tab bar). */
export default function StaffWorkspacesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
