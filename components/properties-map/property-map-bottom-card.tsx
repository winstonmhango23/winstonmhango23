import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { collateralTypeLabel } from '@/lib/collateral-catalog';
import type { ApiPropertyMapPoint } from '@/lib/data/api';
import { formatGeolocationSummary, propertyMapMarkerLabel } from '@/lib/maps';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

type Props = {
  point: ApiPropertyMapPoint;
  onClose: () => void;
  onOpenProperty: () => void;
  onDirections: () => void;
  directionsBusy?: boolean;
};

export function PropertyMapBottomCard({
  point,
  onClose,
  onOpenProperty,
  onDirections,
  directionsBusy,
}: Props) {
  const title = propertyMapMarkerLabel(point);
  const typeLabel = collateralTypeLabel(point.collateral_type, point.other_type_label);

  return (
    <View style={styles.card}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.iconBubble}>
          <MaterialIcons name="home-work" size={22} color={CoFiColors.accent} />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={styles.title} numberOfLines={2}>
            {title}
          </ThemedText>
          <ThemedText style={styles.subtitle} numberOfLines={1}>
            {point.client_name ?? 'Unknown client'} · {typeLabel}
          </ThemedText>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <MaterialIcons name="close" size={20} color={CoFiColors.mutedForeground} />
        </Pressable>
      </View>

      <ThemedText style={styles.coords} numberOfLines={2}>
        {formatGeolocationSummary(point)}
      </ThemedText>

      <View style={styles.metaRow}>
        {point.branch_name ? (
          <MetaChip icon="account-balance" label={point.branch_name} />
        ) : null}
        {point.estimated_value != null ? (
          <MetaChip icon="payments" label={formatMinorMWK(point.estimated_value)} />
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onOpenProperty}>
          <MaterialIcons name="open-in-new" size={18} color={CoFiColors.primary} />
          <ThemedText style={styles.btnSecondaryText}>Open property</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={onDirections}
          disabled={directionsBusy}
        >
          <MaterialIcons name="directions" size={18} color="#fff" />
          <ThemedText style={styles.btnPrimaryText}>
            {directionsBusy ? 'Locating…' : 'Directions'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function MetaChip({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
}) {
  return (
    <View style={styles.chip}>
      <MaterialIcons name={icon} size={14} color={CoFiColors.primary} />
      <ThemedText style={styles.chipText} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    shadowColor: '#061528',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoFiColors.border,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CoFiColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: CoFiColors.foreground,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: CoFiColors.mutedForeground,
  },
  closeBtn: {
    padding: 2,
  },
  coords: {
    marginTop: 10,
    fontSize: 12,
    color: CoFiColors.mutedForeground,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10, 61, 122, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: CoFiColors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnSecondary: {
    backgroundColor: 'rgba(10, 61, 122, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10, 61, 122, 0.16)',
  },
  btnPrimary: {
    backgroundColor: CoFiColors.primary,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: CoFiColors.primary,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
