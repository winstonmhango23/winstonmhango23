import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientChipRow,
  ClientEmptyState,
  ClientListCard,
  ClientModalShell,
  ClientSectionTitle,
  StaffScreen,
  StaffSearchField,
  clientListStyles,
} from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiAssignZoneLoanOfficer,
  apiAttachZoneCreditOfficer,
  apiGetAvailableLoanOfficers,
  apiGetDistricts,
  apiGetStaffMembers,
  apiGetZoneHierarchy,
  apiGetZones,
  apiUpdateDistrict,
  apiUpdateZone,
} from '@/lib/data/zone-district';
import { getStoredAuth } from '@/lib/storage';
import { isSmeCreditBook } from '@/lib/loan-origination/origination-workflow';
import {
  assignLoanOfficerSuccessCopy,
  buildAttachCreditOfficerPayload,
  buildLinkDistrictPayload,
  buildUnlinkDistrictPayload,
  buildZoneLoanOfficerAssignment,
  canSubmitAttachCreditOfficer,
  canSubmitZoneLoanOfficerAssignment,
  cioCompatibleWithZone,
  defaultSupervisorStaffId,
  districtClaimLabel,
  districtsCoveringZone,
  emptyZoneDistrictsCopy,
  filterCioStaff,
  filterZonesByBook,
  isDefaultZoneCode,
  isSmeDistrictClaim,
  loanOfficerCurrentPlacement,
  loanOfficerNeedsTransfer,
  supervisorOptions,
  zoneBookLabel,
  type DistrictRow,
  type ZoneAssignLoanOfficerPayload,
  type ZoneAvailableLoanOfficer,
  type ZoneCreditBookFilter,
  type ZoneHierarchy,
  type ZoneRow,
  type ZoneStaffMember,
} from '@/lib/staff/zone-district';
import { useNotificationsStore } from '@/store/notifications';

const BOOK_FILTERS: { key: ZoneCreditBookFilter; label: string }[] = [
  { key: 'ALL', label: 'All books' },
  { key: 'GROUP', label: 'Group' },
  { key: 'SME', label: 'SME' },
];

type AssignDraft = {
  zone: ZoneRow;
  staffId: number;
  supervisorStaffId: number;
  districtIds: number[];
  includeTransfers: boolean;
};

type AttachCioDraft = {
  zone: ZoneRow;
  staffId: number;
  districtIds: number[];
};

type AddDistrictDraft = {
  zone: ZoneRow;
};

export function ZoneDistrictManagement() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [book, setBook] = useState<ZoneCreditBookFilter>('ALL');
  const [expandedZoneId, setExpandedZoneId] = useState<number | null>(null);
  const [hierarchies, setHierarchies] = useState<Record<number, ZoneHierarchy>>({});
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [assignDraft, setAssignDraft] = useState<AssignDraft | null>(null);
  const [attachCioDraft, setAttachCioDraft] = useState<AttachCioDraft | null>(null);
  const [addDistrictDraft, setAddDistrictDraft] = useState<AddDistrictDraft | null>(null);
  const [unlinkingDistrictId, setUnlinkingDistrictId] = useState<number | null>(null);
  const [multiLoTogglingZoneId, setMultiLoTogglingZoneId] = useState<number | null>(null);
  const defaultZone = useMemo(
    () => zones.find((zone) => isDefaultZoneCode(zone.code)) ?? null,
    [zones]
  );

  const loadZones = useCallback(async (soft = false) => {
    try {
      if (soft) setRefreshing(true);
      else setLoading(true);
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [zoneRows, districtRows] = await Promise.all([
        apiGetZones(auth.token),
        apiGetDistricts(auth.token, { limit: 1000 }),
      ]);
      setZones(zoneRows);
      setDistricts(districtRows);
    } catch (error) {
      Alert.alert('Zones', error instanceof Error ? error.message : 'Could not load zones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  const loadZoneDetail = useCallback(async (zoneId: number) => {
    try {
      setDetailLoadingId(zoneId);
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const hierarchy = await apiGetZoneHierarchy(auth.token, zoneId);
      setHierarchies((prev) => ({ ...prev, [zoneId]: hierarchy }));
    } catch (error) {
      Alert.alert(
        'Zone hierarchy',
        error instanceof Error ? error.message : 'Could not load zone districts'
      );
    } finally {
      setDetailLoadingId(null);
    }
  }, []);

  const visibleZones = useMemo(
    () => filterZonesByBook(zones, book, search),
    [zones, book, search]
  );

  const toggleZone = (zone: ZoneRow) => {
    const next = expandedZoneId === zone.id ? null : zone.id;
    setExpandedZoneId(next);
    if (next != null && !hierarchies[next]) {
      void loadZoneDetail(next);
    }
  };

  const toggleMultiLoanOfficerAssignment = async (zone: ZoneRow, enabled: boolean) => {
    const previous = Boolean(zone.allow_multi_loan_officer_assignment);
    setZones((prev) =>
      prev.map((row) =>
        row.id === zone.id ? { ...row, allow_multi_loan_officer_assignment: enabled } : row
      )
    );
    try {
      setMultiLoTogglingZoneId(zone.id);
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const updated = await apiUpdateZone(auth.token, zone.id, {
        allow_multi_loan_officer_assignment: enabled,
      });
      setZones((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    } catch (error) {
      setZones((prev) =>
        prev.map((row) =>
          row.id === zone.id ? { ...row, allow_multi_loan_officer_assignment: previous } : row
        )
      );
      Alert.alert(
        'Multi-zone officers',
        error instanceof Error ? error.message : 'Could not update this zone'
      );
    } finally {
      setMultiLoTogglingZoneId(null);
    }
  };

  const coveringFor = (zone: ZoneRow) => districtsCoveringZone(zone, districts, zones);

  const openAssign = (zone: ZoneRow, districtId?: number) => {
    const hierarchy = hierarchies[zone.id];
    setAssignDraft({
      zone,
      staffId: 0,
      supervisorStaffId: defaultSupervisorStaffId(hierarchy, zone, districtId),
      districtIds: districtId ? [districtId] : [],
      includeTransfers: Boolean(zone.allow_multi_loan_officer_assignment),
    });
  };

  const unlinkDistrict = (zone: ZoneRow, district: DistrictRow) => {
    const smeClaim = isSmeDistrictClaim(zone, district);
    const payload = buildUnlinkDistrictPayload(zone, district, defaultZone?.id);
    if (!payload) {
      Alert.alert(
        'Unassigned zone missing',
        'Run Seed Canonical Districts on the dashboard once to create the Unassigned zone.'
      );
      return;
    }
    Alert.alert(
      smeClaim ? 'Remove SME claim' : 'Move to Unassigned',
      smeClaim
        ? `Remove "${district.name}" from this SME zone? Group coverage stays in place.`
        : `Move "${district.name}" back to the Unassigned zone?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: smeClaim ? 'Remove claim' : 'Unlink',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setUnlinkingDistrictId(district.id);
                const auth = await getStoredAuth();
                if (!auth?.token) return;
                await apiUpdateDistrict(auth.token, district.id, payload);
                await loadZones(true);
              } catch (error) {
                Alert.alert(
                  'District',
                  error instanceof Error ? error.message : 'Could not unlink this district'
                );
              } finally {
                setUnlinkingDistrictId(null);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <StaffScreen
      scroll
      refreshing={refreshing}
      onRefresh={() => void loadZones(true)}
      header={{
        title: 'Zones & districts',
        subtitle: 'Assign, transfer, or allocate loan officers to one or more districts — and attach CIOs',
        showBack: true,
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Zones', value: String(visibleZones.length) },
          {
            label: 'Officers',
            value: String(visibleZones.reduce((sum, zone) => sum + (zone.officers_count ?? 0), 0)),
          },
        ],
      }}
    >
      <StaffSearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search zone, region, or SCIO"
      />
      <View style={{ height: 12 }} />
      <ClientChipRow options={BOOK_FILTERS} value={book} onChange={setBook} />

      {loading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginTop: 24 }} />
      ) : visibleZones.length === 0 ? (
        <ClientEmptyState
          icon="map"
          title="No zones on this book"
          message="Create Group and SME zones on the admin dashboard, then assign loan officers here."
        />
      ) : (
        visibleZones.map((zone) => {
          const expanded = expandedZoneId === zone.id;
          const hierarchy = hierarchies[zone.id];
          const zoneDistricts = coveringFor(zone);
          return (
            <ClientListCard key={zone.id}>
              <Pressable onPress={() => toggleZone(zone)} style={styles.zoneHeader}>
                <View style={{ flex: 1 }}>
                  <View style={clientListStyles.row}>
                    <ThemedText type="defaultSemiBold" style={clientListStyles.title}>
                      {zone.name}
                    </ThemedText>
                    <ThemedText style={styles.bookPill}>{zoneBookLabel(zone.credit_book)}</ThemedText>
                  </View>
                  <ThemedText style={clientListStyles.subtitle}>
                    {zone.region_name ? `${zone.region_name} · ` : ''}
                    {zoneDistricts.length} districts · {zone.officers_count ?? 0} officers
                    {zone.scio_name ? ` · SCIO ${zone.scio_name}` : ''}
                    {zone.allow_multi_loan_officer_assignment ? ' · multi-zone LOs on' : ''}
                  </ThemedText>
                </View>
                <MaterialIcons
                  name={expanded ? 'expand-less' : 'expand-more'}
                  size={22}
                  color={ClientUI.colors.textMuted}
                />
              </Pressable>

              {expanded ? (
                <View style={styles.zoneBody}>
                  {detailLoadingId === zone.id && !hierarchy ? (
                    <ActivityIndicator color={ClientUI.colors.primary} />
                  ) : (
                    <>
                      <View style={styles.switchRow}>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="defaultSemiBold">Multi-zone loan officers</ThemedText>
                          <ThemedText style={styles.muted}>
                            Show officers already assigned elsewhere and keep their other districts.
                          </ThemedText>
                        </View>
                        <Switch
                          value={Boolean(zone.allow_multi_loan_officer_assignment)}
                          disabled={multiLoTogglingZoneId === zone.id}
                          onValueChange={(enabled) => void toggleMultiLoanOfficerAssignment(zone, enabled)}
                        />
                      </View>
                      <Pressable style={styles.primaryBtn} onPress={() => openAssign(zone)}>
                        <MaterialIcons name="person-add-alt-1" size={18} color="#fff" />
                        <ThemedText style={styles.primaryBtnText}>Assign / transfer loan officer</ThemedText>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryBtn}
                        onPress={() =>
                          setAttachCioDraft({
                            zone,
                            staffId: 0,
                            districtIds: [],
                          })
                        }
                      >
                        <MaterialIcons name="supervisor-account" size={18} color={ClientUI.colors.primary} />
                        <ThemedText style={styles.secondaryBtnText}>Attach CIO</ThemedText>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryBtn}
                        onPress={() => setAddDistrictDraft({ zone })}
                      >
                        <MaterialIcons name="add-location-alt" size={18} color={ClientUI.colors.primary} />
                        <ThemedText style={styles.secondaryBtnText}>Add District</ThemedText>
                      </Pressable>

                      <ThemedText style={styles.sectionLabel}>Districts</ThemedText>
                      {zoneDistricts.length === 0 ? (
                        <ThemedText style={styles.muted}>{emptyZoneDistrictsCopy(zone)}</ThemedText>
                      ) : (
                        zoneDistricts.map((district) => {
                          const claim = districtClaimLabel(zone, district);
                          return (
                            <View key={district.id} style={styles.districtRow}>
                              <Pressable
                                style={{ flex: 1 }}
                                onPress={() => openAssign(zone, district.id)}
                              >
                                <View style={clientListStyles.row}>
                                  <ThemedText type="defaultSemiBold">{district.name}</ThemedText>
                                  {claim ? (
                                    <ThemedText style={styles.claimPill}>{claim}</ThemedText>
                                  ) : null}
                                </View>
                                <ThemedText style={styles.muted}>
                                  {district.loan_officers_count ?? 0} loan officer
                                  {(district.loan_officers_count ?? 0) === 1 ? '' : 's'}
                                  {isSmeDistrictClaim(zone, district) && district.zone_name
                                    ? ` · Group home ${district.zone_name}`
                                    : ''}
                                </ThemedText>
                              </Pressable>
                              <Pressable onPress={() => openAssign(zone, district.id)}>
                                <ThemedText style={styles.link}>Allocate</ThemedText>
                              </Pressable>
                              <Pressable
                                disabled={unlinkingDistrictId === district.id}
                                onPress={() => unlinkDistrict(zone, district)}
                              >
                                {unlinkingDistrictId === district.id ? (
                                  <ActivityIndicator color={ClientUI.colors.primary} />
                                ) : (
                                  <ThemedText style={styles.linkMuted}>Remove</ThemedText>
                                )}
                              </Pressable>
                            </View>
                          );
                        })
                      )}

                      <ThemedText style={styles.sectionLabel}>Hierarchy</ThemedText>
                      {!hierarchy || hierarchy.credit_officers.length === 0 ? (
                        <ThemedText style={styles.muted}>
                          No SCIO or CIO is attached yet. Use Attach CIO below, then assign loan officers
                          to one or more districts.
                        </ThemedText>
                      ) : (
                        hierarchy.credit_officers.map((credit) => (
                          <View key={credit.staff_id} style={styles.cioBlock}>
                            <ThemedText type="defaultSemiBold">
                              {credit.staff_name || `Officer #${credit.staff_id}`}
                              {credit.is_zone_scio ? ' · SCIO' : ' · CIO'}
                            </ThemedText>
                            <ThemedText style={styles.muted}>
                              {credit.district_names.length > 0
                                ? credit.district_names.join(', ')
                                : 'No district coverage yet'}
                            </ThemedText>
                            {credit.loan_officers.length === 0 ? (
                              <ThemedText style={styles.muted}>No loan officers reporting yet.</ThemedText>
                            ) : (
                              credit.loan_officers.map((lo) => (
                                <View key={lo.staff_id} style={styles.loRow}>
                                  <MaterialIcons
                                    name="person-outline"
                                    size={16}
                                    color={ClientUI.colors.textMuted}
                                  />
                                  <View style={{ flex: 1 }}>
                                    <ThemedText>{lo.staff_name || `LO #${lo.staff_id}`}</ThemedText>
                                    <ThemedText style={styles.muted}>
                                      {(lo.district_names ?? []).join(', ') || 'No district'}
                                      {lo.client_count ? ` · ${lo.client_count} clients` : ''}
                                    </ThemedText>
                                  </View>
                                </View>
                              ))
                            )}
                          </View>
                        ))
                      )}

                      {(hierarchy?.unassigned_in_zone ?? []).length > 0 ? (
                        <View style={styles.cioBlock}>
                          <ThemedText type="defaultSemiBold">Unassigned in this zone</ThemedText>
                          {hierarchy.unassigned_in_zone.map((lo) => (
                            <ThemedText key={lo.staff_id} style={styles.muted}>
                              {lo.staff_name || `LO #${lo.staff_id}`} —{' '}
                              {(lo.district_names ?? []).join(', ') || 'district attached, no CIO'}
                            </ThemedText>
                          ))}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </ClientListCard>
          );
        })
      )}

      {attachCioDraft ? (
        <AttachCioSheet
          draft={attachCioDraft}
          districts={coveringFor(attachCioDraft.zone)}
          onChange={setAttachCioDraft}
          onClose={() => setAttachCioDraft(null)}
          onAttached={async () => {
            const zoneId = attachCioDraft.zone.id;
            setAttachCioDraft(null);
            await Promise.all([loadZones(true), loadZoneDetail(zoneId)]);
          }}
        />
      ) : null}

      {assignDraft ? (
        <AssignLoanOfficerSheet
          draft={assignDraft}
          hierarchy={hierarchies[assignDraft.zone.id]}
          districts={coveringFor(assignDraft.zone)}
          onChange={setAssignDraft}
          onClose={() => setAssignDraft(null)}
          onAssigned={async () => {
            setAssignDraft(null);
            await Promise.all([loadZones(true), loadZoneDetail(assignDraft.zone.id)]);
          }}
        />
      ) : null}

      {addDistrictDraft ? (
        <AddDistrictSheet
          zone={addDistrictDraft.zone}
          onClose={() => setAddDistrictDraft(null)}
          onLinked={async () => {
            setAddDistrictDraft(null);
            await loadZones(true);
          }}
        />
      ) : null}
    </StaffScreen>
  );
}

function AttachCioSheet({
  draft,
  districts,
  onChange,
  onClose,
  onAttached,
}: {
  draft: AttachCioDraft;
  districts: DistrictRow[];
  onChange: (next: AttachCioDraft) => void;
  onClose: () => void;
  onAttached: () => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<ZoneStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        const staff = filterCioStaff(await apiGetStaffMembers(auth.token));
        if (!cancelled) setCandidates(staff);
      } catch (error) {
        if (!cancelled) {
          Alert.alert('CIOs', error instanceof Error ? error.message : 'Could not load CIO staff');
          setCandidates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const payload = buildAttachCreditOfficerPayload({
    staffId: draft.staffId,
    districtIds: draft.districtIds,
  });
  const selected = candidates.find((member) => member.id === draft.staffId) ?? null;
  const compatible = cioCompatibleWithZone(selected?.credit_book, draft.zone.credit_book);
  const visible = candidates.filter((member) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [member.full_name, member.role, member.employee_id, member.credit_book]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const submit = async () => {
    if (!canSubmitAttachCreditOfficer(payload) || !compatible || submitting) {
      Alert.alert('Attach CIO', 'Select a CIO and at least one district they will cover.');
      return;
    }
    try {
      setSubmitting(true);
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiAttachZoneCreditOfficer(auth.token, draft.zone.id, payload);
      Alert.alert('CIO attached', `${selected?.full_name || 'CIO'} now covers selected districts in ${draft.zone.name}.`);
      await onAttached();
    } catch (error) {
      Alert.alert(
        'Attach failed',
        error instanceof Error ? error.message : 'Could not attach this CIO'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClientModalShell
      visible
      scrollable
      icon="supervisor-account"
      title={`Attach CIO to ${draft.zone.name}`}
      subtitle={`Choose a Credit & Investment Officer and the districts they cover on the ${zoneBookLabel(draft.zone.credit_book)} book`}
      onClose={onClose}
    >
      <StaffSearchField value={search} onChangeText={setSearch} placeholder="Search CIO staff" />
      {loading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 16 }} />
      ) : visible.length === 0 ? (
        <ThemedText style={styles.muted}>
          No active CIO staff found. Create a Credit & Investment Officer on the web dashboard first.
        </ThemedText>
      ) : (
        <ScrollView style={styles.pickerList} nestedScrollEnabled>
          {visible.map((member) => {
            const isSelected = member.id === draft.staffId;
            const bookOk = cioCompatibleWithZone(member.credit_book, draft.zone.credit_book);
            return (
              <Pressable
                key={member.id}
                style={[styles.pickerRow, isSelected && styles.pickerRowSelected, !bookOk && styles.btnDisabled]}
                onPress={() => onChange({ ...draft, staffId: member.id })}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">{member.full_name}</ThemedText>
                  <ThemedText style={styles.muted}>
                    {zoneBookLabel(member.credit_book)}
                    {bookOk ? '' : ' · other book'}
                  </ThemedText>
                </View>
                {isSelected ? (
                  <MaterialIcons name="check-circle" size={20} color={ClientUI.colors.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ClientSectionTitle title="Districts of coverage (select one or more)" />
      {districts.length === 0 ? (
        <ThemedText style={styles.muted}>
          {isSmeCreditBook(draft.zone.credit_book)
            ? 'Claim a district with Add District first, then attach a CIO. Lilongwe can sit on both books.'
            : 'Add districts to this zone before attaching a CIO.'}
        </ThemedText>
      ) : (
        <View style={styles.wrapChips}>
          {districts.map((district) => {
            const isSelected = draft.districtIds.includes(district.id);
            return (
              <Pressable
                key={district.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() =>
                  onChange({
                    ...draft,
                    districtIds: isSelected
                      ? draft.districtIds.filter((id) => id !== district.id)
                      : [...draft.districtIds, district.id],
                  })
                }
              >
                <ThemedText style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {district.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable
        style={[
          styles.primaryBtn,
          (!canSubmitAttachCreditOfficer(payload) || !compatible || submitting) && styles.btnDisabled,
        ]}
        onPress={() => void submit()}
        disabled={!canSubmitAttachCreditOfficer(payload) || !compatible || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="check" size={18} color="#fff" />
            <ThemedText style={styles.primaryBtnText}>Attach CIO</ThemedText>
          </>
        )}
      </Pressable>
    </ClientModalShell>
  );
}

function AddDistrictSheet({
  zone,
  onClose,
  onLinked,
}: {
  zone: ZoneRow;
  onClose: () => void;
  onLinked: () => Promise<void>;
}) {
  const [available, setAvailable] = useState<DistrictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sme = isSmeCreditBook(zone.credit_book);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        const rows = await apiGetDistricts(auth.token, {
          availableForZoneId: zone.id,
          limit: 1000,
        });
        if (!cancelled) setAvailable(rows);
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            'Districts',
            error instanceof Error ? error.message : 'Could not load available districts'
          );
          setAvailable([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zone.id]);

  const visible = available.filter((district) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [district.name, district.code, district.zone_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const submit = async () => {
    if (!selectedId || submitting) {
      Alert.alert('Add District', 'Select a district from the bank-wide list.');
      return;
    }
    try {
      setSubmitting(true);
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiUpdateDistrict(auth.token, selectedId, buildLinkDistrictPayload(zone));
      const picked = available.find((row) => row.id === selectedId);
      Alert.alert(
        'District linked',
        sme
          ? `${picked?.name || 'District'} is now claimed for this SME zone. Its Group home is unchanged.`
          : `${picked?.name || 'District'} is now on ${zone.name}.`
      );
      await onLinked();
    } catch (error) {
      Alert.alert(
        'Link failed',
        error instanceof Error ? error.message : 'Could not link this district'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClientModalShell
      visible
      scrollable
      icon="add-location-alt"
      title={`Add district to ${zone.name}`}
      subtitle={
        sme
          ? 'Bank-wide picker. Claim any district another SME zone has not taken. Lilongwe can sit on both an SME zone and a Group zone.'
          : 'Bank-wide picker. Districts already on another Group zone stay on that zone.'
      }
      onClose={onClose}
    >
      <StaffSearchField value={search} onChangeText={setSearch} placeholder="Search districts" />
      {loading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 16 }} />
      ) : visible.length === 0 ? (
        <ThemedText style={styles.muted}>
          {sme
            ? 'No districts are free for this SME zone. Another SME zone already claimed the rest.'
            : 'No unassigned districts are left for this Group zone.'}
        </ThemedText>
      ) : (
        <ScrollView style={styles.pickerList} nestedScrollEnabled>
          {visible.map((district) => {
            const selected = district.id === selectedId;
            return (
              <Pressable
                key={district.id}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => setSelectedId(district.id)}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">{district.name}</ThemedText>
                  <ThemedText style={styles.muted}>
                    {district.code}
                    {district.zone_name ? ` · home ${district.zone_name}` : ''}
                  </ThemedText>
                </View>
                {selected ? (
                  <MaterialIcons name="check-circle" size={20} color={ClientUI.colors.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <Pressable
        style={[styles.primaryBtn, (!selectedId || submitting) && styles.btnDisabled]}
        onPress={() => void submit()}
        disabled={!selectedId || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="check" size={18} color="#fff" />
            <ThemedText style={styles.primaryBtnText}>
              {sme ? 'Claim for SME' : 'Link to this zone'}
            </ThemedText>
          </>
        )}
      </Pressable>
    </ClientModalShell>
  );
}

function AssignLoanOfficerSheet({
  draft,
  hierarchy,
  districts,
  onChange,
  onClose,
  onAssigned,
}: {
  draft: AssignDraft;
  hierarchy?: ZoneHierarchy;
  districts: DistrictRow[];
  onChange: (next: AssignDraft) => void;
  onClose: () => void;
  onAssigned: () => Promise<void>;
}) {
  const [officers, setOfficers] = useState<ZoneAvailableLoanOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [officerSearch, setOfficerSearch] = useState('');

  const loadOfficers = useCallback(
    async (includeTransfers: boolean) => {
      try {
        setLoading(true);
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        setOfficers(await apiGetAvailableLoanOfficers(auth.token, draft.zone.id, includeTransfers));
      } catch (error) {
        Alert.alert(
          'Loan officers',
          error instanceof Error ? error.message : 'Could not load available officers'
        );
        setOfficers([]);
      } finally {
        setLoading(false);
      }
    },
    [draft.zone.id]
  );

  useEffect(() => {
    void loadOfficers(draft.includeTransfers || Boolean(draft.zone.allow_multi_loan_officer_assignment));
  }, [draft.includeTransfers, draft.zone.allow_multi_loan_officer_assignment, loadOfficers]);

  const selectedOfficer = officers.find((o) => o.staff_id === draft.staffId) ?? null;
  const supervisors = supervisorOptions(hierarchy);
  const allowMulti = Boolean(draft.zone.allow_multi_loan_officer_assignment);
  const payload: ZoneAssignLoanOfficerPayload = buildZoneLoanOfficerAssignment({
    staffId: draft.staffId,
    supervisorStaffId: draft.supervisorStaffId,
    districtIds: draft.districtIds,
    includeTransfers: draft.includeTransfers,
    allowMultiAssignment: allowMulti,
    officer: selectedOfficer,
  });

  const visibleOfficers = officers.filter((officer) => {
    const q = officerSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      officer.staff_name,
      officer.email,
      officer.employee_id,
      officer.supervisor_name,
      ...(officer.active_zone_names ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const submit = async () => {
    if (!canSubmitZoneLoanOfficerAssignment(payload) || submitting) {
      Alert.alert('Assign officer', 'Select a loan officer, supervisor, and at least one district.');
      return;
    }
    try {
      setSubmitting(true);
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const result = await apiAssignZoneLoanOfficer(auth.token, draft.zone.id, payload);
      Alert.alert('Assigned', assignLoanOfficerSuccessCopy(result));
      await onAssigned();
    } catch (error) {
      Alert.alert(
        'Assignment failed',
        error instanceof Error ? error.message : 'Could not assign this loan officer'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClientModalShell
      visible
      scrollable
      icon="person-add-alt-1"
      title={`Assign to ${draft.zone.name}`}
      subtitle="Assign or transfer a loan officer to one or more districts in this zone"
      onClose={onClose}
    >
      {allowMulti ? (
        <ThemedText style={styles.muted}>
          This zone allows multi-zone assignment. Officers already attached elsewhere stay in the
          list and keep their existing districts.
        </ThemedText>
      ) : (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="defaultSemiBold">Include officers from other zones</ThemedText>
            <ThemedText style={styles.muted}>
              Enable this to reallocate a loan officer who already has a CIO or district elsewhere.
            </ThemedText>
          </View>
          <Switch
            value={draft.includeTransfers}
            onValueChange={(includeTransfers) =>
              onChange({
                ...draft,
                includeTransfers,
                staffId: 0,
              })
            }
          />
        </View>
      )}

      <StaffSearchField
        value={officerSearch}
        onChangeText={setOfficerSearch}
        placeholder="Search loan officers"
      />

      {loading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 16 }} />
      ) : visibleOfficers.length === 0 ? (
        <ThemedText style={styles.muted}>
          {draft.includeTransfers || allowMulti
            ? 'No loan officers are available for this zone.'
            : 'No unassigned loan officers. Turn on Multi-zone LOs on the zone, or enable transfers, to see officers assigned elsewhere.'}
        </ThemedText>
      ) : (
        <ScrollView style={styles.pickerList} nestedScrollEnabled>
          {visibleOfficers.map((officer) => {
            const selected = officer.staff_id === draft.staffId;
            const placement = loanOfficerCurrentPlacement(officer);
            return (
              <Pressable
                key={officer.staff_id}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() =>
                  onChange({
                    ...draft,
                    staffId: officer.staff_id,
                    includeTransfers: draft.includeTransfers || loanOfficerNeedsTransfer(officer),
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">
                    {officer.staff_name || `Officer #${officer.staff_id}`}
                    {officer.is_transfer_candidate ? ' · transfer' : ''}
                  </ThemedText>
                  <ThemedText style={styles.muted}>
                    {placement || 'Unassigned — ready for this zone'}
                  </ThemedText>
                </View>
                {selected ? (
                  <MaterialIcons name="check-circle" size={20} color={ClientUI.colors.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ClientSectionTitle title="Supervisor" />
      {supervisors.length === 0 ? (
        <ThemedText style={styles.muted}>
          Attach a CIO to this zone first, then assign loan officers under them.
        </ThemedText>
      ) : (
        <View style={styles.wrapChips}>
          {supervisors.map((supervisor) => {
            const selected = supervisor.staff_id === draft.supervisorStaffId;
            return (
              <Pressable
                key={supervisor.staff_id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => onChange({ ...draft, supervisorStaffId: supervisor.staff_id })}
              >
                <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {supervisor.staff_name || `#${supervisor.staff_id}`}
                  {supervisor.is_zone_scio ? ' · SCIO' : ' · CIO'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      <ClientSectionTitle title="Districts of operation (select one or more)" />
      {districts.length === 0 ? (
        <ThemedText style={styles.muted}>{emptyZoneDistrictsCopy(draft.zone)}</ThemedText>
      ) : (
        <View style={styles.wrapChips}>
          {districts.map((district) => {
            const selected = draft.districtIds.includes(district.id);
            return (
              <Pressable
                key={district.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() =>
                  onChange({
                    ...draft,
                    districtIds: selected
                      ? draft.districtIds.filter((id) => id !== district.id)
                      : [...draft.districtIds, district.id],
                  })
                }
              >
                <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {district.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedOfficer && loanOfficerNeedsTransfer(selectedOfficer) ? (
        <ThemedText style={styles.transferHint}>
          This officer will leave {loanOfficerCurrentPlacement(selectedOfficer)} and join {draft.zone.name}.
        </ThemedText>
      ) : null}

      <Pressable
        style={[styles.primaryBtn, (!canSubmitZoneLoanOfficerAssignment(payload) || submitting) && styles.btnDisabled]}
        onPress={() => void submit()}
        disabled={!canSubmitZoneLoanOfficerAssignment(payload) || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="check" size={18} color="#fff" />
            <ThemedText style={styles.primaryBtnText}>
              {payload.transfer ? 'Transfer into this zone' : 'Assign to this zone'}
            </ThemedText>
          </>
        )}
      </Pressable>
    </ClientModalShell>
  );
}

const styles = StyleSheet.create({
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  zoneBody: {
    marginTop: 8,
    gap: 8,
  },
  bookPill: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    color: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  muted: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
  },
  districtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.borderLight,
  },
  link: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.primary,
  },
  linkMuted: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
  },
  claimPill: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cioBlock: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  loRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.primary,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  pickerList: {
    maxHeight: 220,
    marginVertical: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 8,
  },
  pickerRowSelected: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
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
  transferHint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.warning,
    marginTop: 4,
  },
});
