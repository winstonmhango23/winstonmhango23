/**
 * Shared sign-out → login navigation.
 * Clears secure tokens / session stores, then replaces the stack with the login screen.
 */

import type { Href } from 'expo-router';

import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/auth';

type ReplaceRouter = {
  replace: (href: Href) => void;
};

export async function signOutToLogin(router: ReplaceRouter): Promise<void> {
  try {
    await useAuthStore.getState().logout();
  } catch (error) {
    logger.error(
      'Sign-out failed while clearing session',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'auth-sign-out' }
    );
    // Still leave the authenticated shell — tokens may already be partially cleared.
  }
  router.replace('/login');
}
