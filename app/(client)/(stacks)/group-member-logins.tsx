import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ClientEmptyState, ClientHeader } from '@/components/client-ui';
import { ClientUI } from '@/constants/client-ui';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';

/**
 * Legacy route — member portal activation is staff / loan-officer only.
 * Deep links land here with an empty-state redirect message.
 */
export default function GroupMemberLoginsScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Member logins"
        subtitle="Staff activation only"
        showBack
        onBack={() => navigateBackToProfile(router)}
      />
      <ClientEmptyState
        icon="lock"
        title="Staff activation required"
        message="Portal account activation and KYC verification are done by your loan officer in the staff app. Borrowers cannot create or verify member logins."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
});
