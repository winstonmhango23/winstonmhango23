/**
 * Filter chip row + FAB for client list screens.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface ChipOption<T extends string> {
  key: T;
  label: string;
}

interface ClientChipRowProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ClientChipRow<T extends string>({ options, value, onChange }: ClientChipRowProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const selected = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: ClientUI.radius.pill,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  chipSelected: {
    backgroundColor: ClientUI.colors.primarySoft,
    borderColor: ClientUI.colors.primary,
  },
  chipText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
  },
  chipTextSelected: {
    color: ClientUI.colors.primary,
  },
});

interface ClientFabProps {
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  bottom?: number;
}

export function ClientFab({ onPress, icon = 'add', bottom = 24 }: ClientFabProps) {
  return (
    <Pressable style={[fabStyles.fab, { bottom }]} onPress={onPress}>
      <MaterialIcons name={icon} size={26} color="#fff" />
    </Pressable>
  );
}

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: ClientUI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...ClientUI.shadows.hero,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
