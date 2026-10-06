import { readAuthSession } from '@/lib/auth-persistence';
import { useAuthStore } from '@/store/auth';

export async function resolveSessionRole(): Promise<'client' | 'staff' | null> {
  const fromStore =
    useAuthStore.getState().role ?? useAuthStore.getState().user?.role ?? null;
  if (fromStore === 'client' || fromStore === 'staff') return fromStore;

  const stored = await readAuthSession();
  const fromSession = stored?.user?.role;
  if (fromSession === 'client' || fromSession === 'staff') return fromSession;
  return null;
}
