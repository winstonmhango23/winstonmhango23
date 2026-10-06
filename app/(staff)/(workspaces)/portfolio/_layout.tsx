import { Stack } from 'expo-router';
import { staffStackScreenOptions } from '@/constants/staff-navigation';

export default function PortfolioLayout() {
  return (
    <Stack screenOptions={staffStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Portfolio' }} />
      <Stack.Screen name="risk" options={{ title: 'Risk Analysis' }} />
      <Stack.Screen name="profitability" options={{ title: 'Profitability' }} />
    </Stack>
  );
}
