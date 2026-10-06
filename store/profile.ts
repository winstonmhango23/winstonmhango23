/**
 * Profile store – user preferences for notifications and settings.
 * Uses backend API; falls back to AsyncStorage when unauthenticated.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth';
import { getAuthToken } from '@/lib/auth-token';
import * as api from '@/lib/data/api';

const PROFILE_KEY = 'profile_prefs';

interface ProfilePreferences {
  smsNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  repaymentReminders: boolean;
  applicationUpdates: boolean;
}

const DEFAULTS: ProfilePreferences = {
  smsNotifications: true,
  emailNotifications: true,
  pushNotifications: true,
  repaymentReminders: true,
  applicationUpdates: true,
};

async function loadPrefsLocal(): Promise<ProfilePreferences> {
  try {
    const { scopedGetItemOptional } = await import('@/lib/account-scope');
    const json = await scopedGetItemOptional(PROFILE_KEY);
    if (json) {
      const parsed = JSON.parse(json) as Partial<ProfilePreferences>;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Ignore
  }
  return DEFAULTS;
}

async function savePrefsLocal(prefs: ProfilePreferences): Promise<void> {
  try {
    const { scopedSetItem } = await import('@/lib/account-scope');
    await scopedSetItem(PROFILE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
}

interface ProfileState extends ProfilePreferences {
  hydrated: boolean;
  resetHydration: () => void;
  hydrate: () => Promise<void>;
  setSmsNotifications: (value: boolean) => void;
  setEmailNotifications: (value: boolean) => void;
  setPushNotifications: (value: boolean) => void;
  setRepaymentReminders: (value: boolean) => void;
  setApplicationUpdates: (value: boolean) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  resetHydration: () => set({ hydrated: false }),

  hydrate: async () => {
    if (get().hydrated) return;
    const { role } = useAuthStore.getState();
    try {
      const token = await getAuthToken();
      if (role === 'client') {
        const settings = await api.apiGetCustomerSettings(token);
        set({
          smsNotifications: settings.sms_notifications ?? DEFAULTS.smsNotifications,
          emailNotifications: settings.email_notifications ?? DEFAULTS.emailNotifications,
          pushNotifications: settings.push_notifications ?? DEFAULTS.pushNotifications,
          repaymentReminders:
            settings.repayment_reminders_enabled ?? DEFAULTS.repaymentReminders,
          applicationUpdates:
            settings.application_updates_enabled ?? DEFAULTS.applicationUpdates,
          hydrated: true,
        });
      } else if (role === 'staff') {
        const prefs = await api.apiGetStaffDigestPreferences(token);
        const channels = prefs.digest_channels ?? ['EMAIL', 'IN_APP'];
        set({
          ...DEFAULTS,
          smsNotifications: DEFAULTS.smsNotifications,
          emailNotifications: channels.includes('EMAIL'),
          pushNotifications: channels.includes('IN_APP'),
          repaymentReminders: prefs.daily_digest_enabled ?? DEFAULTS.repaymentReminders,
          applicationUpdates: DEFAULTS.applicationUpdates,
          hydrated: true,
        });
      } else {
        const prefs = await loadPrefsLocal();
        set({ ...prefs, hydrated: true });
      }
    } catch {
      const prefs = await loadPrefsLocal();
      set({ ...prefs, hydrated: true });
    }
  },

  setSmsNotifications: (value) => {
    const next = { ...get(), smsNotifications: value };
    set(next);
    savePrefsLocal(next);
    syncToBackend(next, 'sms_notifications', value);
  },
  setEmailNotifications: (value) => {
    const next = { ...get(), emailNotifications: value };
    set(next);
    savePrefsLocal(next);
    syncToBackend(next, 'email_notifications', value);
  },
  setPushNotifications: (value) => {
    const next = { ...get(), pushNotifications: value };
    set(next);
    savePrefsLocal(next);
    syncToBackend(next, 'push_notifications', value);
  },
  setRepaymentReminders: (value) => {
    const next = { ...get(), repaymentReminders: value };
    set(next);
    savePrefsLocal(next);
    const role = useAuthStore.getState().role;
    syncToBackend(
      next,
      role === 'client' ? 'repayment_reminders_enabled' : 'daily_digest_enabled',
      value
    );
  },
  setApplicationUpdates: (value) => {
    const next = { ...get(), applicationUpdates: value };
    set(next);
    savePrefsLocal(next);
    if (useAuthStore.getState().role === 'client') {
      syncToBackend(next, 'application_updates_enabled', value);
    }
  },
}));

async function syncToBackend(
  prefs: ProfilePreferences,
  backendKey: string,
  _value: boolean
): Promise<void> {
  const { role } = useAuthStore.getState();
  try {
    const token = await getAuthToken();
    if (role === 'client') {
      const payload: Record<string, boolean> = {};
      if (backendKey === 'sms_notifications') payload.sms_notifications = prefs.smsNotifications;
      else if (backendKey === 'email_notifications') payload.email_notifications = prefs.emailNotifications;
      else if (backendKey === 'push_notifications') payload.push_notifications = prefs.pushNotifications;
      else if (backendKey === 'repayment_reminders_enabled') {
        payload.repayment_reminders_enabled = prefs.repaymentReminders;
      } else if (backendKey === 'application_updates_enabled') {
        payload.application_updates_enabled = prefs.applicationUpdates;
      }
      if (Object.keys(payload).length > 0) {
        await api.apiPutCustomerSettings(token, payload);
      }
    } else if (role === 'staff') {
      const digestPayload: { daily_digest_enabled?: boolean; digest_channels?: string[] } = {};
      if (backendKey === 'daily_digest_enabled') {
        digestPayload.daily_digest_enabled = prefs.repaymentReminders;
      }
      if (backendKey === 'email_notifications' || backendKey === 'push_notifications') {
        const channels: string[] = [];
        if (prefs.emailNotifications) channels.push('EMAIL');
        if (prefs.pushNotifications) channels.push('IN_APP');
        digestPayload.digest_channels = channels.length > 0 ? channels : ['IN_APP'];
      }
      if (Object.keys(digestPayload).length > 0) {
        await api.apiPutStaffDigestPreferences(token, digestPayload);
      }
    }
  } catch {
    // Ignore - local state is updated
  }
}
