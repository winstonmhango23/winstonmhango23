import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  count: number;
  loading?: boolean;
  onFitMalawi: () => void;
  onFitMarkers: () => void;
  onRecenterMe: () => void;
  locating?: boolean;
};

export function PropertyMapToolbar({
  query,
  onQueryChange,
  count,
  loading,
  onFitMalawi,
  onFitMarkers,
  onRecenterMe,
  locating,
}: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={20} color={CoFiColors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search client, property, place…"
          placeholderTextColor={CoFiColors.mutedForeground}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {loading ? <ActivityIndicator size="small" color={CoFiColors.primary} /> : null}
      </View>

      <View style={styles.metaRow}>
        <ThemedText style={styles.count}>
          {count} propert{count === 1 ? 'y' : 'ies'} on map
        </ThemedText>
        <View style={styles.actions}>
          <ToolBtn icon="public" label="Malawi" onPress={onFitMalawi} />
          <ToolBtn icon="zoom-out-map" label="Fit" onPress={onFitMarkers} />
          <ToolBtn
            icon="my-location"
            label="Me"
            onPress={onRecenterMe}
            busy={locating}
          />
        </View>
      </View>
    </View>
  );
}

function ToolBtn({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable style={styles.toolBtn} onPress={onPress} disabled={busy}>
      {busy ? (
        <ActivityIndicator size="small" color={CoFiColors.primary} />
      ) : (
        <MaterialIcons name={icon} size={16} color={CoFiColors.primary} />
      )}
      <ThemedText style={styles.toolLabel}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    shadowColor: '#061528',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: CoFiColors.foreground,
    paddingVertical: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: CoFiColors.primaryDark,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: CoFiColors.primary,
  },
});
