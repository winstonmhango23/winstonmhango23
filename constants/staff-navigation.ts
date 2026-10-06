/**
 * Shared navigation chrome for staff stack screens.
 */

import { ClientUI } from '@/constants/client-ui';

export const staffStackScreenOptions = {
  headerShown: false,
  contentStyle: { flex: 1, backgroundColor: ClientUI.colors.canvas },
} as const;

export const staffScreenContainer = {
  flex: 1,
  backgroundColor: ClientUI.colors.canvas,
} as const;
