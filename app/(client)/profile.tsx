import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';

import { ChangePasswordModal } from '@/components/change-password-modal';
import { EditProfileModal } from '@/components/edit-profile-modal';
import { ClientHeader, ClientListCard, ClientSectionTitle } from '@/components/client-ui';
import { ProfileRow } from '@/components/ui/profile-row';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { resolveClientDisplayEmail, resolveClientDisplayName } from '@/lib/auth-user';
import { signOutToLogin } from '@/lib/auth-sign-out';
import { config } from '@/lib/config';
import * as profileApi from '@/lib/data/api';
import { canManageGroupLeaders, canViewGroupMembersRoster } from '@/lib/client-portal/session-auth';
import { useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import { useAuthStore } from '@/store/auth';
import { useClientSessionStore } from '@/store/client-session';
import { useProfileStore } from '@/store/profile';

export default function ClientProfileScreen() {
  const router = useRouter();
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const { uri: profilePhotoUri } = useAuthenticatedImageUri(profilePhotoPath);
  const [profileDetails, setProfileDetails] = useState<{
    full_name?: string;
    email?: string;
  } | null>(null);
  const session = useClientSessionStore((s) => s.session);
  const canViewGroupMembers = canViewGroupMembersRoster(session);
  const canEditGroupLeaders = canManageGroupLeaders(session);
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
    if (user?.role === 'client') {
      useProfileStore.getState().hydrate();
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'client' || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await profileApi.apiGetCustomerProfile(token);
        if (cancelled) return;
        setProfilePhotoPath(profile.profile_photo_url?.trim() || null);
        setProfileDetails({
          full_name: profile.full_name,
          email: profile.email,
        });
        const u = useAuthStore.getState().user;
        if (u) {
          await setAuth(
            {
              ...u,
              id: profile.client_id ?? u.id,
              email: profile.email?.trim() || u.email,
              fullName: profile.full_name?.trim() || u.fullName,
              phoneNumber: profile.phone_number ?? u.phoneNumber,
            },
            token
          );
        }
      } catch {
        if (!cancelled) {
          setProfilePhotoPath(null);
          setProfileDetails(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role, token, editProfileVisible, setAuth]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const displayName = resolveClientDisplayName(user, session?.full_name, profileDetails?.full_name);
  const displayEmail = resolveClientDisplayEmail(user, profileDetails?.email);
  const avatarInitial = displayName.charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.root}>
      <ClientHeader title="Profile" subtitle="Account settings & preferences" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ClientListCard style={styles.profileCard}>
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              {profilePhotoUri ? (
                <Image
                  source={{ uri: profilePhotoUri }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <ThemedText style={styles.avatarText}>{avatarInitial}</ThemedText>
              )}
            </View>
            <View style={styles.profileInfo}>
              <ThemedText style={styles.name}>{displayName}</ThemedText>
              <ThemedText style={styles.email}>{displayEmail || '—'}</ThemedText>
              <View style={styles.roleBadge}>
                <MaterialIcons name="verified-user" size={12} color={ClientUI.colors.primary} />
                <ThemedText style={styles.roleText}>CoFi Client</ThemedText>
              </View>
            </View>
          </View>
        </ClientListCard>

        <ClientSectionTitle title="Notifications" />
        <View style={styles.section}>
          <ProfileRow
            icon="sms"
            label="SMS notifications"
            hint="Repayment reminders & alerts"
            switchValue={smsNotifications}
            onSwitchChange={setSmsNotifications}
          />
          <ProfileRow
            icon="email"
            label="Email notifications"
            hint="Application updates & statements"
            switchValue={emailNotifications}
            onSwitchChange={setEmailNotifications}
          />
          <ProfileRow
            icon="notifications"
            label="Push notifications"
            hint="In-app alerts"
            switchValue={pushNotifications}
            onSwitchChange={setPushNotifications}
          />
          <ProfileRow
            icon="schedule"
            label="Repayment reminders"
            hint="Before due dates"
            switchValue={repaymentReminders}
            onSwitchChange={setRepaymentReminders}
          />
          <ProfileRow
            icon="description"
            label="Application updates"
            hint="Status changes"
            switchValue={applicationUpdates}
            onSwitchChange={setApplicationUpdates}
          />
        </View>

        <ClientSectionTitle title="Account" />
        <View style={styles.section}>
          <ProfileRow
            icon="lock"
            label="Change password"
            hint="Update your password"
            onPress={() => setChangePasswordVisible(true)}
          />
          {user?.isGroupAdmin ? (
            <ProfileRow
              icon="person"
              label="Edit profile"
              hint="Update name, photo, ID, and all details"
              onPress={() => setEditProfileVisible(true)}
            />
          ) : (
            <ProfileRow
              icon="verified-user"
              label="Profile & KYC"
              hint="Update your personal details and documents"
              onPress={() => router.push('/(client)/kyc' as Href)}
            />
          )}
          {canViewGroupMembers ? (
            <ProfileRow
              icon="groups"
              label="Group members"
              hint={
                session?.can_administer_group_roster || session?.dashboard_mode === 'group_parent'
                  ? 'Add, edit & manage members'
                  : session?.can_record_group_repayments
                    ? 'View members and record repayments'
                    : 'View group members'
              }
              onPress={() => router.push('/(client)/group-members' as Href)}
            />
          ) : null}
          {canEditGroupLeaders ? (
            <ProfileRow
              icon="military-tech"
              label="Group leaders"
              hint="Assign chair, secretary, treasurer & custom roles"
              onPress={() => router.push('/(client)/group-leaders' as Href)}
            />
          ) : null}
          <ProfileRow
            icon="folder"
            label="My documents"
            hint="Profile files and loan-request uploads"
            onPress={() => router.push('/(client)/documents' as Href)}
          />
          <ProfileRow
            icon="group-add"
            label="My guarantors"
            hint="Catalog and guarantors on your applications"
            onPress={() => router.push('/(client)/guarantors' as Href)}
          />
          <ProfileRow
            icon="add-location-alt"
            label="My collateral"
            hint="Cash, property vault & pledges on applications"
            onPress={() => router.push('/(client)/collateral-vault' as Href)}
          />
          <ProfileRow
            icon="sync"
            label="Sync Center"
            hint="Pending uploads and failed sync items"
            onPress={() => router.push('/(client)/sync' as Href)}
          />
        </View>

        <ClientSectionTitle title="Support" />
        <View style={styles.section}>
          <ProfileRow
            icon="help"
            label="Help & FAQ"
            onPress={() => Linking.openURL(config.support.helpFaq).catch(() => {})}
          />
          <ProfileRow
            icon="contact-support"
            label="Contact support"
            hint="Get in touch"
            onPress={() => Linking.openURL(config.support.contact).catch(() => {})}
          />
          <ProfileRow
            icon="info"
            label="App version"
            value={appVersion}
            showChevron={false}
            onPress={undefined}
          />
        </View>

        <View style={styles.section}>
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
      />
      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  profileCard: { marginBottom: 8 },
  avatarSection: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: ClientUI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
  },
  avatarText: {
    fontFamily: Fonts.headingBold,
    color: '#fff',
    fontSize: 24,
  },
  profileInfo: { flex: 1 },
  name: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: ClientUI.colors.text,
  },
  email: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  roleText: {
    fontSize: 12,
    color: ClientUI.colors.primary,
    fontWeight: '600',
  },
  section: { marginBottom: 12 },
});
