import { create } from 'zustand';

import { fetchMobileSession } from '@/lib/client-portal/api';
import type { MobileClientSessionContext } from '@/lib/data/api';

interface ClientSessionState {
  session: MobileClientSessionContext | null;
  loading: boolean;
  error: string | null;
  fetchSession: (token: string) => Promise<MobileClientSessionContext | null>;
  setSession: (session: MobileClientSessionContext | null) => void;
  clear: () => void;
}

export const useClientSessionStore = create<ClientSessionState>((set) => ({
  session: null,
  loading: false,
  error: null,

  fetchSession: async (token: string) => {
    set({ loading: true, error: null });
    try {
      const session = await fetchMobileSession(token);
      set({ session, loading: false });
      return session;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load session';
      set({ error: message, loading: false });
      return null;
    }
  },

  setSession: (session) => set({ session }),

  clear: () => set({ session: null, error: null, loading: false }),
}));
