import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ClientEmptyState } from '@/components/staff-ui';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';

export function DesktopOnlyWorkspace({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <MaterialIcons name="desktop-windows" size={18} color={CoFiColors.primary} />
        <ThemedText style={styles.bannerText}>Desktop BMS only</ThemedText>
      </View>
      <ClientEmptyState
        icon="desktop-windows"
        title={title}
        message={message}
        actionLabel="Back to Digest"
        onAction={() => router.replace('/(staff)')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(10,61,122,0.08)',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: CoFiColors.primary,
  },
});
