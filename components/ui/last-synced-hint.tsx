import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';

function formatSyncedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function LastSyncedHint({ syncedAt }: { syncedAt?: string | null }) {
  const label = formatSyncedAt(syncedAt ?? null);
  if (!label) return null;
  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.text}>Last synced {label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  text: {
    fontSize: 12,
    color: CoFiColors.mutedForeground,
  },
});
