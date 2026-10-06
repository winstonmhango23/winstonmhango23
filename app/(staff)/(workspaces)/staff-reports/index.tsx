/**
 * Unified staff reporting hub — dashboard, period-scoped generate, mine, inbox.
 * Aligned with web StaffReportingHub and FastAPI /staff-reports.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiAcknowledgeStaffReport,
  apiForwardStaffReport,
  apiGenerateStaffReport,
  apiListStaffReports,
  apiReturnStaffReport,
  apiStaffReportCatalog,
  apiStaffReportDashboard,
  type ApiManagedStaffReport,
  type ApiStaffReportCatalogItem,
  type ApiStaffReportDashboard,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  REPORT_PERIOD_PRESETS,
  defaultCustomRange,
  resolveReportPeriod,
  type ReportPeriodPresetId,
} from '@/lib/staff/report-period';
import { getStoredAuth } from '@/lib/storage';

type HubTab = 'dashboard' | 'generate' | 'mine' | 'inbox';

function summarize(report: ApiManagedStaffReport): string {
  const s = report.summary || {};
  if (s.loan_count != null) return `${s.loan_count} loans`;
  if (s.active_loan_count != null) return `${s.active_loan_count} active`;
  if (s.par_30_pct != null) return `PAR30 ${s.par_30_pct}%`;
  if (s.headline_par_30_pct != null) return `PAR30 ${s.headline_par_30_pct}%`;
  if (s.application_count != null) return `${s.application_count} applications`;
  if (s.repayment_count != null) return `${s.repayment_count} repayments`;
  if (s.collected_minor != null) return `Collected ${formatMinorMWK(Number(s.collected_minor))}`;
  if (s.outstanding_minor != null) return `OS ${formatMinorMWK(Number(s.outstanding_minor))}`;
  return report.catalog_key.replace(/_/g, ' ');
}

function statusColor(status: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'ACKNOWLEDGED') return ClientUI.colors.success;
  if (s === 'RETURNED') return ClientUI.colors.danger;
  if (s === 'FORWARDED' || s === 'PARTIALLY_ACKNOWLEDGED') return '#0284c7';
  if (s === 'GENERATED') return ClientUI.colors.textMuted;
  return ClientUI.colors.textMuted;
}

function formatPeriod(from?: string | null, to?: string | null): string | null {
  if (!from && !to) return null;
  const a = from ? new Date(from).toLocaleDateString() : '—';
  const b = to ? new Date(to).toLocaleDateString() : '—';
  return `${a} → ${b}`;
}

function SummaryChips({ summary }: { summary?: Record<string, unknown> | null }) {
  if (!summary) return null;
  const chips: { label: string; value: string }[] = [];
  if (summary.loan_count != null) chips.push({ label: 'Loans', value: String(summary.loan_count) });
  if (summary.active_loan_count != null)
    chips.push({ label: 'Active', value: String(summary.active_loan_count) });
  if (summary.outstanding_minor != null)
    chips.push({ label: 'Outstanding', value: formatMinorMWK(Number(summary.outstanding_minor)) });
  if (summary.par_30_pct != null) chips.push({ label: 'PAR30', value: `${summary.par_30_pct}%` });
  if (summary.headline_par_30_pct != null)
    chips.push({ label: 'PAR30', value: `${summary.headline_par_30_pct}%` });
  if (summary.collected_minor != null)
    chips.push({ label: 'Collected', value: formatMinorMWK(Number(summary.collected_minor)) });
  if (summary.application_count != null)
    chips.push({ label: 'Apps', value: String(summary.application_count) });
  if (!chips.length) return null;
  return (
    <View style={styles.chipRow}>
      {chips.map((c) => (
        <View key={`${c.label}-${c.value}`} style={styles.metricChip}>
          <ThemedText style={styles.metricChipText}>
            {c.label}: {c.value}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

export default function StaffReportsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<HubTab>('dashboard');
  const [catalog, setCatalog] = useState<ApiStaffReportCatalogItem[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [mine, setMine] = useState<ApiManagedStaffReport[]>([]);
  const [inbox, setInbox] = useState<ApiManagedStaffReport[]>([]);
  const [dashboard, setDashboard] = useState<ApiStaffReportDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forwardRoles, setForwardRoles] = useState<string[]>([]);
  const [forwardMessage, setForwardMessage] = useState('');
  const [reviewNotesById, setReviewNotesById] = useState<Record<number, string>>({});
  const [roleLabel, setRoleLabel] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPresetId>('30d');
  const [customFrom, setCustomFrom] = useState(() => defaultCustomRange().from);
  const [customTo, setCustomTo] = useState(() => defaultCustomRange().to);

  const selected = useMemo(
    () => catalog.find((c) => c.key === selectedKey) || null,
    [catalog, selectedKey],
  );

  const periodResolved = useMemo(
    () => resolveReportPeriod(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo],
  );

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Sign in required.');
        return;
      }
      const [dash, cat, mineRes, inboxRes] = await Promise.all([
        apiStaffReportDashboard(auth.token).catch(() => null),
        apiStaffReportCatalog(auth.token),
        apiListStaffReports(auth.token, { mine_only: true, limit: 40 }),
        apiListStaffReports(auth.token, { inbox_only: true, limit: 40 }),
      ]);
      setDashboard(dash);
      setCatalog(cat.items);
      setRoleLabel(cat.role);
      setSelectedKey((prev) => {
        const next = prev || cat.items[0]?.key || '';
        const defaults = cat.items.find((c) => c.key === next)?.default_forward_roles;
        if (defaults?.length) {
          setForwardRoles((roles) => (roles.length ? roles : [...defaults]));
        }
        return next;
      });
      setMine(mineRes.items);
      setInbox(inboxRes.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load staff reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const item = catalog.find((c) => c.key === selectedKey);
    if (item?.default_forward_roles?.length) {
      setForwardRoles(item.default_forward_roles);
    }
  }, [selectedKey, catalog]);

  const toggleRole = (role: string) => {
    setForwardRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const onGenerate = async (andForward: boolean) => {
    const auth = await getStoredAuth();
    if (!auth?.token || !selectedKey) return;
    if ('error' in periodResolved) {
      Alert.alert('Period', periodResolved.error);
      return;
    }
    if (andForward && !forwardRoles.length) {
      Alert.alert('Select roles', 'Choose at least one forward role.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await apiGenerateStaffReport(auth.token, {
        catalog_key: selectedKey,
        title: title.trim() || undefined,
        period_from: periodResolved.dateFrom.toISOString(),
        period_to: periodResolved.dateTo.toISOString(),
        priority,
        forward_to_roles: andForward ? forwardRoles : undefined,
        forward_message: andForward ? forwardMessage.trim() || undefined : undefined,
      });
      setTitle('');
      setForwardMessage('');
      await load({ soft: true });
      setTab('mine');
      Alert.alert(
        'Report ready',
        andForward
          ? `${created.title} generated and forwarded (${periodResolved.label}).`
          : `${created.title} generated for ${periodResolved.label}.`,
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setBusy(false);
    }
  };

  const onForward = async (report: ApiManagedStaffReport) => {
    if (!forwardRoles.length) {
      Alert.alert('Select roles', 'Choose at least one forward role.');
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      await apiForwardStaffReport(auth.token, report.id, {
        to_roles: forwardRoles,
        message: forwardMessage.trim() || undefined,
        priority,
      });
      setForwardMessage('');
      await load({ soft: true });
      Alert.alert('Forwarded', 'Report sent to selected roles.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Forward failed');
    } finally {
      setBusy(false);
    }
  };

  const onAck = async (report: ApiManagedStaffReport) => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      await apiAcknowledgeStaffReport(
        auth.token,
        report.id,
        (reviewNotesById[report.id] || '').trim() || undefined,
      );
      setReviewNotesById((prev) => ({ ...prev, [report.id]: '' }));
      await load({ soft: true });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Acknowledge failed');
    } finally {
      setBusy(false);
    }
  };

  const onReturn = async (report: ApiManagedStaffReport) => {
    const notes = (reviewNotesById[report.id] || '').trim();
    if (!notes) {
      Alert.alert('Notes required', 'Enter return notes for the originator.');
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      await apiReturnStaffReport(auth.token, report.id, notes);
      setReviewNotesById((prev) => ({ ...prev, [report.id]: '' }));
      await load({ soft: true });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Return failed');
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (id: number) => {
    router.push(`/(staff)/staff-reports/${id}` as Href);
  };

  if (loading && !dashboard && catalog.length === 0) {
    return (
      <StaffDetailScreen title="Staff reports" subtitle="Unified reporting hub">
        <View style={styles.center}>
          <ActivityIndicator color={ClientUI.colors.primary} />
        </View>
      </StaffDetailScreen>
    );
  }

  const pendingInbox = dashboard?.inbox_pending_count ?? inbox.length;

  return (
    <StaffDetailScreen
      title="Staff reports"
      subtitle={
        roleLabel
          ? `${roleLabel.replace(/_/g, ' ')} · generate · forward · review`
          : 'Portfolio, credit, ops, finance & audit packs'
      }
    >
      <View style={styles.tabs}>
        {(
          [
            ['dashboard', 'Hub'],
            ['generate', 'Generate'],
            ['mine', 'Mine'],
            ['inbox', `Inbox${pendingInbox ? ` (${pendingInbox})` : ''}`],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <ThemedText style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ soft: true });
            }}
          />
        }
      >
        {tab === 'dashboard' ? (
          <>
            <ThemedText style={styles.lead}>
              Live workflow counters for packs you generate and reviews waiting in your inbox. Use
              Generate with a reporting period for collections/disbursement movement; portfolio PAR
              packs reflect the current book stock.
            </ThemedText>
            <View style={styles.kpiGrid}>
              {[
                { label: 'Catalog', value: dashboard?.catalog_count ?? catalog.length },
                { label: 'Generated', value: dashboard?.generated_count ?? 0 },
                { label: 'Forwarded', value: dashboard?.forwarded_count ?? 0 },
                { label: 'Inbox', value: dashboard?.inbox_pending_count ?? 0 },
                { label: 'Acked', value: dashboard?.acknowledged_count ?? 0 },
                { label: 'Returned', value: dashboard?.returned_count ?? 0 },
              ].map((k) => (
                <View key={k.label} style={styles.kpi}>
                  <ThemedText style={styles.kpiValue}>{k.value}</ThemedText>
                  <ThemedText style={styles.kpiLabel}>{k.label}</ThemedText>
                </View>
              ))}
            </View>

            <ThemedText style={styles.section}>Recent generated</ThemedText>
            {(dashboard?.recent_mine || mine.slice(0, 5)).length === 0 ? (
              <ThemedText style={styles.muted}>No packs generated yet.</ThemedText>
            ) : (
              (dashboard?.recent_mine?.length ? dashboard.recent_mine : mine.slice(0, 5)).map((r) => (
                <Pressable key={r.id} style={styles.card} onPress={() => openDetail(r.id)}>
                  <View style={styles.cardHead}>
                    <ThemedText style={styles.cardTitle}>{r.title}</ThemedText>
                    <ThemedText style={[styles.badge, { color: statusColor(r.status) }]}>
                      {r.status.replace(/_/g, ' ')}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.muted}>{summarize(r)}</ThemedText>
                  <SummaryChips summary={r.summary} />
                </Pressable>
              ))
            )}

            <ThemedText style={styles.section}>Recent inbox</ThemedText>
            {(dashboard?.recent_inbox || inbox.slice(0, 5)).length === 0 ? (
              <ThemedText style={styles.muted}>Inbox is clear.</ThemedText>
            ) : (
              (dashboard?.recent_inbox?.length ? dashboard.recent_inbox : inbox.slice(0, 5)).map(
                (r) => (
                  <Pressable key={r.id} style={styles.card} onPress={() => openDetail(r.id)}>
                    <View style={styles.cardHead}>
                      <ThemedText style={styles.cardTitle}>{r.title}</ThemedText>
                      <ThemedText style={[styles.badge, { color: statusColor(r.status) }]}>
                        {r.status.replace(/_/g, ' ')}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.muted}>
                      From {r.generated_by_name || '—'} · {summarize(r)}
                    </ThemedText>
                  </Pressable>
                ),
              )
            )}
          </>
        ) : null}

        {tab === 'generate' ? (
          <>
            <ThemedText style={styles.lead}>
              Select a catalog pack, set the accounting period, optionally forward to credit /
              ops / executive roles for acknowledgement.
            </ThemedText>

            <ThemedText style={styles.section}>Reporting period</ThemedText>
            <View style={styles.chipRow}>
              {REPORT_PERIOD_PRESETS.map((p) => {
                const active = periodPreset === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => setPeriodPreset(p.id)}
                  >
                    <ThemedText
                      style={[styles.presetChipText, active && styles.presetChipTextActive]}
                    >
                      {p.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {periodPreset === 'custom' ? (
              <View style={styles.customRow}>
                <TextInput
                  style={[styles.input, styles.half]}
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="From YYYY-MM-DD"
                  placeholderTextColor={ClientUI.colors.textMuted}
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.input, styles.half]}
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="To YYYY-MM-DD"
                  placeholderTextColor={ClientUI.colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            ) : null}
            <ThemedText style={styles.periodHint}>
              {'error' in periodResolved
                ? periodResolved.error
                : `Active window: ${periodResolved.label}`}
            </ThemedText>

            <ThemedText style={styles.section}>Report type</ThemedText>
            {catalog.length === 0 ? (
              <ThemedText style={styles.muted}>
                No catalog packs available for your role. Ask an admin to grant report permissions.
              </ThemedText>
            ) : (
              catalog.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.card, selectedKey === c.key && styles.cardSelected]}
                  onPress={() => setSelectedKey(c.key)}
                >
                  <View style={styles.cardHead}>
                    <ThemedText style={styles.cardTitle}>{c.name}</ThemedText>
                    <ThemedText style={styles.category}>{c.category}</ThemedText>
                  </View>
                  <ThemedText style={styles.muted}>{c.description}</ThemedText>
                </Pressable>
              ))
            )}

            {selected ? (
              <>
                <ThemedText style={styles.section}>Optional title</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Auto-titled if blank"
                  placeholderTextColor={ClientUI.colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                />

                <ThemedText style={styles.section}>Priority</ThemedText>
                <View style={styles.chipRow}>
                  {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => {
                    const active = priority === p;
                    return (
                      <Pressable
                        key={p}
                        style={[styles.presetChip, active && styles.presetChipActive]}
                        onPress={() => setPriority(p)}
                      >
                        <ThemedText
                          style={[styles.presetChipText, active && styles.presetChipTextActive]}
                        >
                          {p}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <ThemedText style={styles.section}>Forward roles (optional)</ThemedText>
                {selected.allowed_forward_roles.map((role) => (
                  <Pressable key={role} style={styles.roleRow} onPress={() => toggleRole(role)}>
                    <MaterialIcons
                      name={forwardRoles.includes(role) ? 'check-box' : 'check-box-outline-blank'}
                      size={20}
                      color={ClientUI.colors.primary}
                    />
                    <ThemedText style={styles.roleLabel}>{role.replace(/_/g, ' ')}</ThemedText>
                  </Pressable>
                ))}
                <TextInput
                  style={styles.input}
                  placeholder="Forward message for reviewers / credit committee"
                  placeholderTextColor={ClientUI.colors.textMuted}
                  value={forwardMessage}
                  onChangeText={setForwardMessage}
                  multiline
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => void onGenerate(false)}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <ThemedText style={styles.btnText}>Generate</ThemedText>
                    )}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.btn,
                      styles.btnSecondary,
                      (busy || !forwardRoles.length) && styles.btnDisabled,
                    ]}
                    disabled={busy || !forwardRoles.length}
                    onPress={() => void onGenerate(true)}
                  >
                    <ThemedText style={styles.btnTextDark}>Generate & forward</ThemedText>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'mine' ? (
          mine.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="description" size={36} color={ClientUI.colors.textMuted} />
              <ThemedText style={styles.cardTitle}>No reports generated yet</ThemedText>
              <ThemedText style={styles.muted}>
                Generate a period pack from the Generate tab. Tap a pack to open KPIs and payload.
              </ThemedText>
            </View>
          ) : (
            mine.map((r) => {
              const period = formatPeriod(r.period_from, r.period_to);
              return (
                <View key={r.id} style={styles.card}>
                  <Pressable onPress={() => openDetail(r.id)}>
                    <View style={styles.cardHead}>
                      <ThemedText style={styles.cardTitle}>{r.title}</ThemedText>
                      <ThemedText style={[styles.badge, { color: statusColor(r.status) }]}>
                        {r.status.replace(/_/g, ' ')}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.muted}>
                      {r.catalog_key.replace(/_/g, ' ')}
                      {period ? ` · ${period}` : ''}
                    </ThemedText>
                    <ThemedText style={styles.muted}>{summarize(r)}</ThemedText>
                    <SummaryChips summary={r.summary} />
                  </Pressable>
                  {(r.status === 'GENERATED' || r.status === 'RETURNED') && selected ? (
                    <Pressable
                      style={[styles.btn, styles.btnPrimary, { marginTop: 10 }, busy && styles.btnDisabled]}
                      disabled={busy}
                      onPress={() => void onForward(r)}
                    >
                      <ThemedText style={styles.btnText}>Forward selected roles</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )
        ) : null}

        {tab === 'inbox' ? (
          inbox.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="inbox" size={36} color={ClientUI.colors.textMuted} />
              <ThemedText style={styles.cardTitle}>Inbox clear</ThemedText>
              <ThemedText style={styles.muted}>
                Forwarded packs awaiting your acknowledgement appear here.
              </ThemedText>
            </View>
          ) : (
            inbox.map((r) => (
              <View key={r.id} style={styles.card}>
                <Pressable onPress={() => openDetail(r.id)}>
                  <View style={styles.cardHead}>
                    <ThemedText style={styles.cardTitle}>{r.title}</ThemedText>
                    <ThemedText style={[styles.badge, { color: statusColor(r.status) }]}>
                      {r.status.replace(/_/g, ' ')}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.muted}>
                    From {r.generated_by_name || '—'} ({(r.generated_by_role || '').replace(/_/g, ' ')})
                    · {summarize(r)}
                  </ThemedText>
                  <SummaryChips summary={r.summary} />
                  {r.forward_message ? (
                    <ThemedText style={styles.msg}>{r.forward_message}</ThemedText>
                  ) : null}
                </Pressable>
                <TextInput
                  style={styles.input}
                  placeholder="Review notes (required to return)"
                  placeholderTextColor={ClientUI.colors.textMuted}
                  value={reviewNotesById[r.id] || ''}
                  onChangeText={(v) =>
                    setReviewNotesById((prev) => ({ ...prev, [r.id]: v }))
                  }
                  multiline
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => void onAck(r)}
                  >
                    <ThemedText style={styles.btnText}>Acknowledge</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnDanger, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => void onReturn(r)}
                  >
                    <ThemedText style={styles.btnText}>Return</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))
          )
        ) : null}
      </ScrollView>
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.surfaceMuted,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: ClientUI.colors.primary },
  tabText: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.text, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  body: { padding: 16, paddingBottom: 48, gap: 10 },
  lead: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    lineHeight: 19,
    marginBottom: 4,
  },
  section: {
    marginTop: 8,
    marginBottom: 2,
    fontFamily: Fonts.sans,
    fontWeight: '700',
    fontSize: 14,
    color: ClientUI.colors.text,
  },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
    padding: 12,
  },
  kpiValue: { fontFamily: Fonts.sans, fontSize: 20, fontWeight: '800', color: ClientUI.colors.text },
  kpiLabel: { fontFamily: Fonts.sans, fontSize: 11, color: ClientUI.colors.textMuted, marginTop: 2 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 12,
    backgroundColor: ClientUI.colors.surface,
    gap: 4,
  },
  cardSelected: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  cardTitle: { flex: 1, fontFamily: Fonts.sans, fontWeight: '700', fontSize: 15, color: ClientUI.colors.text },
  badge: { fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  category: { fontFamily: Fonts.sans, fontSize: 11, color: ClientUI.colors.primary, fontWeight: '700' },
  muted: { marginTop: 2, fontSize: 12, color: ClientUI.colors.textMuted, fontFamily: Fonts.sans, lineHeight: 17 },
  msg: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.surfaceMuted,
    fontSize: 12,
    color: ClientUI.colors.text,
    fontFamily: Fonts.sans,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricChip: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metricChipText: { fontSize: 11, color: ClientUI.colors.text, fontFamily: Fonts.sans },
  presetChip: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: ClientUI.colors.surface,
  },
  presetChipActive: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  presetChipText: { fontSize: 12, fontWeight: '600', color: ClientUI.colors.text, fontFamily: Fonts.sans },
  presetChipTextActive: { color: '#fff' },
  periodHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.primary,
    fontWeight: '600',
  },
  customRow: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  roleLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.text,
    textTransform: 'capitalize',
  },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.sans,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.surface,
    minHeight: 44,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: ClientUI.colors.primary },
  btnSecondary: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  btnDanger: { backgroundColor: ClientUI.colors.danger },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '700', fontFamily: Fonts.sans },
  btnTextDark: { color: ClientUI.colors.text, fontWeight: '700', fontFamily: Fonts.sans },
  error: {
    color: ClientUI.colors.danger,
    paddingHorizontal: 16,
    marginTop: 8,
    fontFamily: Fonts.sans,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.surface,
  },
});
