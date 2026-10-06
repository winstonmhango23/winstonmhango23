import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientEmptyState, StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import type { RegionRow } from '@/lib/data/zone-district';
import { apiGetDistricts, apiGetRegions, apiGetZones } from '@/lib/data/zone-district';
import type { DistrictRow, ZoneRow } from '@/lib/staff/zone-district';
import { getStoredAuth } from '@/lib/storage';

export function DistrictCoverage() {
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regionId, setRegionId] = useState<number | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [regionRows, zoneRows, districtRows] = await Promise.all([
        apiGetRegions(auth.token),
        apiGetZones(auth.token),
        apiGetDistricts(auth.token),
      ]);
      setRegions(regionRows);
      setZones(zoneRows);
      setDistricts(districtRows);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRegions = useMemo(() => {
    if (regionId !== 'ALL') return regions.filter((r) => r.id === regionId);
    return regions;
  }, [regions, regionId]);

  const regionZones = useCallback(
    (region: RegionRow | 'UNASSIGNED') => {
      if (region === 'UNASSIGNED') return zones.filter((z) => z.region_id == null);
      return zones.filter((z) => z.region_id === region.id);
    },
    [zones]
  );

  const zoneDistricts = useCallback(
    (zoneId: number) => districts.filter((d) => d.zone_id === zoneId),
    [districts]
  );

  const unassignedZones = useMemo(() => zones.filter((z) => z.region_id == null), [zones]);
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const totals = useMemo(() => {
    const covered = districts.filter((d) => (d.loan_officers_count ?? 0) > 0).length;
    return {
      regions: regions.length,
      zones: zones.length,
      districts: districts.length,
      covered,
      uncovered: districts.length - covered,
    };
  }, [regions, zones, districts]);

  return (
    <StaffDetailScreen
      title="District coverage"
      subtitle={`${totals.regions} region${totals.regions === 1 ? '' : 's'} · ${totals.zones} zone${totals.zones === 1 ? '' : 's'} · ${totals.districts} district${totals.districts === 1 ? '' : 's'}`}
      noPadding
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <MaterialIcons name="public" size={14} color={CoFiColors.primary} />
          <ThemedText style={styles.summaryText}>{totals.zones} zones</ThemedText>
        </View>
        <View style={styles.summaryChip}>
          <MaterialIcons name="location-city" size={14} color={CoFiColors.success} />
          <ThemedText style={styles.summaryText}>
            {totals.covered} assigned
          </ThemedText>
        </View>
        {totals.uncovered > 0 ? (
          <View style={styles.summaryChip}>
            <MaterialIcons name="warning" size={14} color={CoFiColors.warning} />
            <ThemedText style={styles.summaryText}>{totals.uncovered} unassigned</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, regionId === 'ALL' && styles.filterChipActive]}
          onPress={() => setRegionId('ALL')}
        >
          <ThemedText style={[styles.filterText, regionId === 'ALL' && styles.filterTextActive]}>All</ThemedText>
        </Pressable>
        {regions.map((region) => (
          <Pressable
            key={region.id}
            style={[styles.filterChip, regionId === region.id && styles.filterChipActive]}
            onPress={() => setRegionId(region.id)}
          >
            <ThemedText style={[styles.filterText, regionId === region.id && styles.filterTextActive]}>
              {region.name}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={visibleRegions}
        keyExtractor={(region) => String(region.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={CoFiColors.primary} />}
        ListHeaderComponent={
          unassignedZones.length > 0 ? <UnassignedBlock zones={unassignedZones} /> : null
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="map"
            title={loading ? 'Loading coverage…' : 'No regions yet'}
            message={loading ? 'Fetching the region/zone/district tree.' : 'Create regions on the BMS to start organising coverage.'}
          />
        }
        renderItem={({ item: region }) => {
          const zs = regionZones(region);
          return (
            <View style={styles.regionCard}>
              <View style={styles.regionHeader}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">{region.name}</ThemedText>
                  <ThemedText style={styles.meta}>
                    {region.code} · {region.zones_count ?? zs.length} zone{zs.length === 1 ? '' : 's'}
                  </ThemedText>
                </View>
                {region.description ? <ThemedText style={styles.meta}>{region.description}</ThemedText> : null}
              </View>
              {zs.length === 0 ? (
                <ThemedText style={styles.emptyLine}>No zones assigned to this region yet.</ThemedText>
              ) : (
                zs.map((zone) => {
                  const dists = zoneDistricts(zone.id);
                  const key = `z:${zone.id}`;
                  const open = expanded.has(key);
                  return (
                    <View key={zone.id} style={styles.zoneCard}>
                      <Pressable style={styles.zoneHeader} onPress={() => toggle(key)}>
                        <MaterialIcons
                          name={open ? 'expand-more' : 'chevron-right'}
                          size={18}
                          color={CoFiColors.primary}
                        />
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.zoneName}>{zone.name}</ThemedText>
                          <ThemedText style={styles.meta}>
                            {zone.code}
                            {zone.credit_book ? ` · ${zone.credit_book}` : ''}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.zoneCount}>
                          {zone.districts_count ?? dists.length} district{dists.length === 1 ? '' : 's'}
                        </ThemedText>
                      </Pressable>
                      {open ? (
                        <View style={styles.districtList}>
                          {dists.length === 0 ? (
                            <ThemedText style={styles.emptyLine}>No districts in this zone yet.</ThemedText>
                          ) : (
                            dists.map((district) => (
                              <View key={district.id} style={styles.districtRow}>
                                <MaterialIcons name="location-on" size={14} color={CoFiColors.mutedForeground} />
                                <View style={{ flex: 1 }}>
                                  <ThemedText style={styles.districtName}>{district.name}</ThemedText>
                                  <ThemedText style={styles.meta}>{district.code}</ThemedText>
                                </View>
                                <View
                                  style={[
                                    styles.officerPill,
                                    (district.loan_officers_count ?? 0) === 0 && styles.officerPillNone,
                                  ]}
                                >
                                  <MaterialIcons
                                    name="person"
                                    size={12}
                                    color={
                                      (district.loan_officers_count ?? 0) > 0
                                        ? CoFiColors.success
                                        : CoFiColors.mutedForeground
                                    }
                                  />
                                  <ThemedText style={styles.officerText}>
                                    {district.loan_officers_count ?? 0} LO
                                  </ThemedText>
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          );
        }}
      />
    </StaffDetailScreen>
  );
}

function UnassignedBlock({ zones }: { zones: ZoneRow[] }) {
  return (
    <View style={styles.regionCard}>
      <View style={styles.regionHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold">Unassigned zones</ThemedText>
          <ThemedText style={styles.meta}>{zones.length} zone{zones.length === 1 ? '' : 's'} without a region</ThemedText>
        </View>
      </View>
      {zones.map((zone) => (
        <View key={zone.id} style={styles.zoneCard}>
          <ThemedText style={styles.zoneName}>{zone.name}</ThemedText>
          <ThemedText style={styles.meta}>
            {zone.code} · {zone.districts_count ?? 0} districts · {zone.officers_count ?? 0} LOs
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  summaryText: { fontSize: 12.5, fontWeight: '600' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 10 },
  filterChip: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: CoFiColors.backgroundCard,
  },
  filterChipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  filterText: { fontSize: 12.5, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  list: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 14 },
  regionCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 10,
  },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  meta: { fontSize: 12.5, opacity: 0.68 },
  emptyLine: { fontSize: 13, opacity: 0.65, paddingVertical: 4 },
  zoneCard: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: CoFiColors.background,
  },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneName: { fontSize: 13.5, fontWeight: '600' },
  zoneCount: { fontSize: 12.5, fontWeight: '600', color: CoFiColors.primary },
  districtList: { gap: 6, marginTop: 6 },
  districtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  districtName: { fontSize: 13 },
  officerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: CoFiColors.success,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  officerPillNone: { borderColor: CoFiColors.border },
  officerText: { fontSize: 11.5, fontWeight: '600' },
});