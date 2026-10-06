import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { ChangePasswordModal } from '@/components/change-password-modal';
import { BankingCard } from '@/components/ui/banking-card';
import { ProfileRow } from '@/components/ui/profile-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { signOutToLogin } from '@/lib/auth-sign-out';
import { config } from '@/lib/config';
import * as api from '@/lib/data/api';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';

export default function StaffProfileScreen() {
  const router = useRouter();
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { user, setAuth, token } = useAuthStore();
  const {
    smsNotifications,
    emailNotifications,
    pushNotifications,
    repaymentReminders,
    applicationUpdates,
    setSmsNotifications,
    setEmailNotifications,
    setPushNotifications,
    setRepaymentReminders,
    setApplicationUpdates,
  } = useProfileStore();

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutToLogin(router);
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'staff' && token) {
      useProfileStore.getState().hydrate();
      api.apiGetStaffProfile(token)
        .then((me) => {
          const u = useAuthStore.getState().user;
          if (me && u) {
            setAuth({
              ...u,
              id: me.id ?? u.id,
              email: me.email ?? u.email,
              fullName: me.full_name ?? u.fullName,
              role: 'staff',
              backendRole: typeof me.role === 'string' ? me.role : u.backendRole,
              creditBook: typeof me.credit_book === 'string' ? me.credit_book : u.creditBook,
              employeeId: me.employee_id ?? u.employeeId,
              branchId: me.branch_id ?? u.branchId,
              bankId: me.bank_id ?? u.bankId,
            }, token);
          }
        })
        .catch(() => {});
    }
  }, [user?.role, token, setAuth]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Profile"
        subtitle="Staff account & preferences"
        icon="person"
        fullWidth
        flush
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <BankingCard style={styles.avatarCard}>
            <View style={styles.avatarSection}>
              <View style={styles.avatar}>
                <ThemedText type="subtitle" style={styles.avatarText}>
                  {(user?.fullName ?? (user as { full_name?: string })?.full_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.profileInfo}>
                <ThemedText type="defaultSemiBold" style={styles.name}>
                  {user?.fullName ?? (user as { full_name?: string })?.full_name ?? user?.email ?? 'Staff Member'}
                </ThemedText>
                <ThemedText style={styles.email}>{user?.email ?? '—'}</ThemedText>
                {user?.employeeId && (
                  <ThemedText style={styles.employeeId}>ID: {user.employeeId}</ThemedText>
                )}
                <View style={styles.badgeRow}>
                  <View style={styles.roleBadge}>
                    <ThemedText style={styles.roleText}>
                      {user?.backendRole
                        ? String(user.backendRole).replace(/_/g, ' ')
                        : (user?.role ?? 'Staff')}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>
          </BankingCard>
        </View>

        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Profile Records</ThemedText>
        <View style={styles.section}>
          <ProfileRow
            icon="person"
            label="Full name"
            value={user?.fullName ?? (user as { full_name?: string })?.full_name ?? user?.email ?? '—'}
            showChevron={false}
            onPress={undefined}
          />
          <ProfileRow
            icon="email"
            label="Email"
            value={user?.email ?? '—'}
            showChevron={false}
            onPress={undefined}
          />
          {user?.employeeId && (
            <ProfileRow
              icon="badge"
              label="Employee ID"
              value={user.employeeId}
              showChevron={false}
              onPress={undefined}
            />
          )}
        </View>

        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Notifications</ThemedText>
        <View style={styles.section}>
          <ProfileRow
            icon="sms"
            label="SMS alerts"
            hint="Overdue & repayment notifications"
            switchValue={smsNotifications}
            onSwitchChange={setSmsNotifications}
          />
          <ProfileRow
            icon="email"
            label="Email notifications"
            hint="Application submissions & reports"
            switchValue={emailNotifications}
            onSwitchChange={setEmailNotifications}
          />
          <ProfileRow
            icon="notifications"
            label="Push notifications"
            hint="Real-time alerts"
            switchValue={pushNotifications}
            onSwitchChange={setPushNotifications}
          />
          <ProfileRow
            icon="warning"
            label="Overdue reminders"
            hint="Daily digest for arrears"
            switchValue={repaymentReminders}
            onSwitchChange={setRepaymentReminders}
          />
          <ProfileRow
            icon="description"
            label="New application alerts"
            hint="When clients submit"
            switchValue={applicationUpdates}
            onSwitchChange={setApplicationUpdates}
          />
        </View>

        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Account</ThemedText>
        <View style={styles.section}>
          <ProfileRow
            icon="tune"
            label="Digest settings"
            hint="Daily digest time and delivery channels"
            onPress={() => router.push('/(staff)/notification-settings' as Href)}
          />
          <ProfileRow
            icon="assessment"
            label="Reports"
            hint="Portfolio analytics and aging"
            onPress={() => router.push('/(staff)/reports' as Href)}
          />
          <ProfileRow
            icon="sync"
            label="Sync Center"
            hint="Pending field uploads & errors"
            onPress={() => router.push('/(staff)/sync' as Href)}
          />
          <ProfileRow
            icon="lock"
            label="Change password"
            hint="Update your password"
            onPress={() => setChangePasswordVisible(true)}
          />
          <ProfileRow
            icon="security"
            label="Staff permissions"
            hint={`Role: ${(user?.role ?? 'Staff').toUpperCase()}`}
            onPress={() => Alert.alert('Staff Permissions', `Your role: ${(user?.role ?? 'Staff').toUpperCase()}. Permission management is available in the web dashboard.`)}
          />
        </View>

        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Support</ThemedText>
        <View style={styles.section}>
          <ProfileRow
            icon="help"
            label="Help & FAQ"
            onPress={() => Linking.openURL(config.support.helpFaq).catch(() => {})}
          />
          <ProfileRow
            icon="contact-support"
            label="Contact support"
            hint="Technical assistance"
            onPress={() => Linking.openURL(config.support.contact).catch(() => {})}
          />
        </View>

        <View style={styles.section}>
          <ProfileRow
            icon="info"
            label="App version"
            value={appVersion}
            showChevron={false}
            onPress={undefined}
          />
        </View>

        <View style={styles.actions}>
          <ProfileRow
            icon="swap-horiz"
            label="Sign in with a different account"
            hint={signingOut ? 'Signing out…' : 'Clear session and open the sign-in screen'}
            onPress={handleSignOut}
          />
          <ProfileRow
            icon="logout"
            label={signingOut ? 'Signing out…' : 'Sign out'}
            hint="Clears your tokens and returns you to sign in"
            destructive
            onPress={handleSignOut}
          />
        </View>
      </ScrollView>

      <ChangePasswordModal
        visible={changePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
        forStaff
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  profileCard: { marginBottom: 24 },
  avatarCard: { padding: 20 },
  avatarSection: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: CoFiColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: { color: '#fff', fontSize: 24 },
  profileInfo: { flex: 1 },
  name: { fontSize: 18 },
  email: { fontSize: 14, opacity: 0.7, marginTop: 2 },
  employeeId: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(10,61,122,0.1)',
  },
  roleText: { fontSize: 12, color: CoFiColors.primary, fontWeight: '600' },
  sectionTitle: { marginBottom: 12, marginTop: 8, fontSize: 15, opacity: 0.9 },
  section: { marginBottom: 8 },
  actions: { marginTop: 24 },
});
