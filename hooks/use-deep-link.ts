/**
 * Deep link handling – loanmanagementapp://loan/123, loanmanagementapp://reset-password?token=xxx
 */

import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

function parseLoanId(url: string): string | null {
  const match = url.match(/loans?\/(\d+)/);
  return match ? match[1] : null;
}

function parseResetPasswordToken(url: string): string | null {
  // loanmanagementapp://reset-password?token=xxx
  try {
    const parsed = Linking.parse(url);
    const token = parsed.queryParams?.token;
    return typeof token === 'string' ? token : null;
  } catch {
    return null;
  }
}

export function useDeepLink(): void {
  const router = useRouter();
  const role = useAuthStore((s) => s.role);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const resetToken = parseResetPasswordToken(event.url);
      if (resetToken) {
        router.replace({ pathname: '/reset-password', params: { token: resetToken } });
        return;
      }
      const loanId = parseLoanId(event.url);
      if (loanId && role === 'client') {
        router.replace(`/(client)/loans/${loanId}`);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [router, role]);
}
