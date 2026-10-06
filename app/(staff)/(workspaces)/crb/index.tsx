/**
 * Role-distilled CRB workspace — LO book, CIO/SCIO portfolio, ops branch.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { ApiClientError } from '@/lib/api-client';
import {
  apiAcknowledgeCrbReport,
  apiCrbReportsHealth,
  apiForwardCrbReport,
  apiGenerateCrbReport,
  apiGetCrbContext,
  apiListCrbCios,
  apiListCrbManagers,
  apiListCrbPortfolioOfficers,
  apiListCrbReports,
  apiReturnCrbReport,
  apiSubmitCrbReportToManager,
  type ApiCrbActorContext,
  type ApiCrbCioOption,
  type ApiCrbCreditBook,
  type ApiCrbManagerOption,
  type ApiCrbPortfolioOfficer,
  type ApiCrbReportSummary,
  type ApiCrbReportType,
} from '@/lib/data/api';
import {
  crbScopeLabel,
  crbWorkspaceCopy,
  resolveCrbWorkspaceMode,
  summarizeCrbReport,
} from '@/lib/crb/report-utils';
import {
  defaultCustomRange,
  REPORT_PERIOD_PRESETS,
  resolveReportPeriod,
  type ReportPeriodPresetId,
} from '@/lib/staff/report-period';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

const REPORT_TYPES: { id: ApiCrbReportType; label: string }[] = [
  { id: 'NEW_CLIENTS_CRB', label: 'New clients' },
  { id: 'EXISTING_CLIENTS_CRB', label: 'Existing clients' },
  { id: 'ACTIVE_LOANS_CRB', label: 'Active loans' },
  { id: 'PORTFOLIO_CRB', label: 'Portfolio' },
];

const CREDIT_BOOKS: { id: ApiCrbCreditBook; label: string }[] = [
  { id: 'ALL', label: 'All types' },
  { id: 'SME', label: 'SME' },
  { id: 'GROUP', label: 'Group' },
];

function statusColor(status: string): string {
  switch (status) {
    case 'ACKNOWLEDGED':
      return ClientUI.colors.success;
    case 'FORWARDED_TO_CIO':
    case 'FORWARDED_TO_MANAGER':
      return ClientUI.colors.primary;
    case 'RETURNED':
      return ClientUI.colors.danger;
    default:
      return ClientUI.colors.textMuted;
  }
}

function crbErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError && e.status === 404) {
    return (
      'CRB report API is not available on the server yet (404). ' +
      'Ask ops to redeploy backCFAPi so /api/v1/crb-reports is live, then pull to refresh.'
    );
  }
  if (e instanceof Error && e.message.trim()) {
    if (/^not found$/i.test(e.message.trim())) {
      return (
        'CRB report API is not available on the server yet (404). ' +
        'Ask ops to redeploy backCFAPi so /api/v1/crb-reports is live, then pull to refresh.'
      );
    }
    return e.message;
  }
  return fallback;
}

function formatPeriodLabel(report: ApiCrbReportSummary): string {
  const from = report.period_from ? String(report.period_from).slice(0, 10) : null;
  const to = report.period_to ? String(report.period_to).slice(0, 10) : null;
  if (from && to) return `${from} → ${to}`;
  if (to) return `to ${to}`;
  if (from) return `from ${from}`;
  return '';
}

export default function CrbReportsScreen() {
  const { user } = useAuthStore();
  const role = user?.backendRole ?? user?.role;
  const workspaceMode = resolveCrbWorkspaceMode(role);
  const isLoanOfficer = workspaceMode === 'loan_officer';
  const isCio = workspaceMode === 'cio';
  const isOpsOfficer = workspaceMode === 'ops_officer';
  const isOpsManager = workspaceMode === 'ops_manager';
  const isOps = isOpsOfficer || isOpsManager;
  const copy = crbWorkspaceCopy(workspaceMode ?? 'loan_officer');

  const [context, setContext] = useState<ApiCrbActorContext | null>(null);
  const [officers, setOfficers] = useState<ApiCrbPortfolioOfficer[]>([]);
  const [officerId, setOfficerId] = useState<number | 'portfolio'>('portfolio');
  const [inbox, setInbox] = useState<ApiCrbReportSummary[]>([]);
  const [listMode, setListMode] = useState<'inbox' | 'all'>('inbox');
  const [items, setItems] = useState<ApiCrbReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [cios, setCios] = useState<ApiCrbCioOption[]>([]);
  const [managers, setManagers] = useState<ApiCrbManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [reportType, setReportType] = useState<ApiCrbReportType>('ACTIVE_LOANS_CRB');
  const [creditBook, setCreditBook] = useState<ApiCrbCreditBook>('ALL');
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPresetId>('30d');
  const customDefaults = useMemo(() => defaultCustomRange(), []);
  const [customFrom, setCustomFrom] = useState(customDefaults.from);
  const [customTo, setCustomTo] = useState(customDefaults.to);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listPeriodPreset, setListPeriodPreset] = useState<ReportPeriodPresetId | 'all'>('all');
  const [listTypeFilter, setListTypeFilter] = useState<ApiCrbReportType | 'ALL'>('ALL');

  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<ApiCrbReportSummary | null>(null);
  const [selectedCioId, setSelectedCioId] = useState<number | null>(null);
  const [forwardMessage, setForwardMessage] = useState('');

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<ApiCrbReportSummary | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Sign in required.');
        setItems([]);
        setTotal(0);
        return;
      }

      const ready = await apiCrbReportsHealth();
      setApiReady(ready);
      if (!ready) {
        setError(
          'CRB report API is not available on the server yet (404). ' +
            'Ask ops to redeploy backCFAPi so /api/v1/crb-reports is live, then pull to refresh.'
        );
        setItems([]);
        setTotal(0);
        return;
      }

      const listOpts: Parameters<typeof apiListCrbReports>[1] = {
        mine_only: isLoanOfficer && !isCio,
        limit: 100,
      };
      if (isOps) listOpts.workflow_channel = 'OPS_OM';
      if (debouncedSearch) listOpts.search = debouncedSearch;
      if (listTypeFilter !== 'ALL') listOpts.report_type = listTypeFilter;
      if (listPeriodPreset !== 'all') {
        const resolved = resolveReportPeriod(listPeriodPreset, customFrom, customTo);
        if (!('error' in resolved)) {
          listOpts.period_from = resolved.dateFrom.toISOString();
          listOpts.period_to = resolved.dateTo.toISOString();
        }
      }

      const inboxOpts: Parameters<typeof apiListCrbReports>[1] = {
        inbox_only: true,
        limit: 100,
      };
      if (isOpsManager) inboxOpts.workflow_channel = 'OPS_OM';
      if (debouncedSearch) inboxOpts.search = debouncedSearch;
      if (listTypeFilter !== 'ALL') inboxOpts.report_type = listTypeFilter;

      const [ctx, list, inboxList, officerList] = await Promise.all([
        apiGetCrbContext(auth.token).catch(() => null),
        apiListCrbReports(auth.token, listOpts),
        isCio || isOpsManager
          ? apiListCrbReports(auth.token, inboxOpts)
          : Promise.resolve({ items: [], total: 0 }),
        isCio ? apiListCrbPortfolioOfficers(auth.token).catch(() => []) : Promise.resolve([]),
      ]);
      setContext(ctx);
      setItems(list.items);
      setTotal(list.total);
      setInbox(inboxList.items);
      setOfficers(officerList);
      if (isLoanOfficer) {
        setCios(await apiListCrbCios(auth.token));
      }
      if (isOpsOfficer) {
        setManagers(await apiListCrbManagers(auth.token));
      }
    } catch (e) {
      setError(crbErrorMessage(e, 'Could not load CRB reports'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    customFrom,
    customTo,
    debouncedSearch,
    isCio,
    isLoanOfficer,
    isOps,
    isOpsManager,
    isOpsOfficer,
    listPeriodPreset,
    listTypeFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultCioId = useMemo(() => {
    const supervisor = cios.find((c) => c.is_supervisor);
    return supervisor?.id ?? cios[0]?.id ?? null;
  }, [cios]);
  const defaultManagerId = useMemo(() => {
    const supervisor = managers.find((m) => m.is_supervisor);
    return supervisor?.id ?? managers[0]?.id ?? null;
  }, [managers]);

  const generatePeriodLabel = useMemo(() => {
    const resolved = resolveReportPeriod(periodPreset, customFrom, customTo);
    if ('error' in resolved) return 'select period';
    return resolved.label;
  }, [customFrom, customTo, periodPreset]);

  const onGenerate = async () => {
    const resolved = resolveReportPeriod(periodPreset, customFrom, customTo);
    if ('error' in resolved) {
      Alert.alert('Period required', resolved.error);
      return;
    }
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('Sign in required');
      await apiGenerateCrbReport(auth.token, {
        report_type: reportType,
        date_from: resolved.dateFrom.toISOString(),
        date_to: resolved.dateTo.toISOString(),
        format_type: isCio || isOps ? 'CRB_ENHANCED' : 'STANDARD',
        workflow_channel: isOps ? 'OPS_OM' : 'LO_CIO',
        loan_officer_id: isCio && officerId !== 'portfolio' ? officerId : undefined,
        credit_book: creditBook,
      });
      await load();
      Alert.alert(
        'CRB report generated',
        isCio
          ? `Portfolio snapshot for ${resolved.label} is ready.`
          : isOpsOfficer
            ? `Branch package for ${resolved.label} is ready. Submit it to the Operations Manager when ready.`
            : `Snapshot for ${resolved.label} is ready. Forward it when ready.`
      );
    } catch (e) {
      Alert.alert('Generate failed', crbErrorMessage(e, 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const openForward = (report: ApiCrbReportSummary) => {
    setForwardTarget(report);
    setSelectedCioId(defaultCioId);
    setForwardMessage('');
    setForwardOpen(true);
  };

  const onForward = async () => {
    if (!forwardTarget || !selectedCioId) {
      Alert.alert('Select a CIO', 'Choose the Credit Investment Officer to receive this report.');
      return;
    }
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('Sign in required');
      await apiForwardCrbReport(auth.token, forwardTarget.id, {
        to_cio_id: selectedCioId,
        message: forwardMessage.trim() || undefined,
      });
      setForwardOpen(false);
      await load();
      Alert.alert('Forwarded', 'CRB report sent to your CIO.');
    } catch (e) {
      Alert.alert('Forward failed', crbErrorMessage(e, 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const openSubmit = (report: ApiCrbReportSummary) => {
    setSubmitTarget(report);
    setSelectedManagerId(defaultManagerId);
    setSubmitMessage('');
    setSubmitOpen(true);
  };

  const onSubmitToManager = async () => {
    if (!submitTarget || !selectedManagerId) {
      Alert.alert('Select a manager', 'Choose the Operations Manager to receive this package.');
      return;
    }
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('Sign in required');
      await apiSubmitCrbReportToManager(auth.token, submitTarget.id, {
        to_manager_id: selectedManagerId,
        message: submitMessage.trim() || undefined,
      });
      setSubmitOpen(false);
      await load();
      Alert.alert('Submitted', 'CRB package sent to the Operations Manager.');
    } catch (e) {
      Alert.alert('Submit failed', crbErrorMessage(e, 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const onAcknowledge = (report: ApiCrbReportSummary) => {
    Alert.alert('Acknowledge CRB report', `Mark "${report.title}" as reviewed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Acknowledge',
        onPress: async () => {
          setBusy(true);
          try {
            const auth = await getStoredAuth();
            if (!auth?.token) throw new Error('Sign in required');
            await apiAcknowledgeCrbReport(auth.token, report.id);
            await load();
          } catch (e) {
            Alert.alert('Failed', crbErrorMessage(e, 'Unknown error'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onReturn = (report: ApiCrbReportSummary) => {
    Alert.alert(
      isOpsManager ? 'Return to operations' : 'Return to loan officer',
      'Return this report with a request for corrections?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const auth = await getStoredAuth();
              if (!auth?.token) throw new Error('Sign in required');
              await apiReturnCrbReport(
                auth.token,
                report.id,
                'Please revise and re-forward this CRB report.'
              );
              await load();
            } catch (e) {
              Alert.alert('Failed', crbErrorMessage(e, 'Unknown error'));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (!workspaceMode) {
    return (
      <StaffDetailScreen title="CRB reports" subtitle="Staff CRB workspace">
        <ThemedText style={styles.muted}>
          CRB report management is available to loan officers, credit officers, operations officers, assistants, and the operations manager.
        </ThemedText>
      </StaffDetailScreen>
    );
  }

  const visibleReports = isCio || isOpsManager
    ? listMode === 'inbox'
      ? inbox
      : items
    : items;

  return (
    <StaffDetailScreen
      title={copy.title}
      subtitle={copy.subtitle}
      scroll
      onRefresh={load}
      refreshing={loading}
    >
      <View style={styles.generateCard}>
        <ThemedText style={styles.sectionTitle}>{copy.generateTitle}</ThemedText>
        {context?.label ? (
          <ThemedText style={styles.muted}>Scope: {context.label}</ThemedText>
        ) : null}
        <ThemedText style={styles.fieldLabel}>Report type</ThemedText>
        <View style={styles.typeRow}>
          {REPORT_TYPES.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.typeChip, reportType === t.id && styles.typeChipActive]}
              onPress={() => setReportType(t.id)}
            >
              <ThemedText
                style={[styles.typeChipText, reportType === t.id && styles.typeChipTextActive]}
              >
                {t.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ThemedText style={styles.fieldLabel}>Client / loan type</ThemedText>
        <View style={styles.typeRow}>
          {CREDIT_BOOKS.map((book) => (
            <Pressable
              key={book.id}
              style={[styles.typeChip, creditBook === book.id && styles.typeChipActive]}
              onPress={() => setCreditBook(book.id)}
            >
              <ThemedText
                style={[styles.typeChipText, creditBook === book.id && styles.typeChipTextActive]}
              >
                {book.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {isCio && officers.length ? (
          <>
            <ThemedText style={styles.fieldLabel}>Officer book</ThemedText>
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeChip, officerId === 'portfolio' && styles.typeChipActive]}
                onPress={() => setOfficerId('portfolio')}
              >
                <ThemedText
                  style={[
                    styles.typeChipText,
                    officerId === 'portfolio' && styles.typeChipTextActive,
                  ]}
                >
                  All supervised
                </ThemedText>
              </Pressable>
              {officers.map((officer) => (
                <Pressable
                  key={officer.id}
                  style={[styles.typeChip, officerId === officer.id && styles.typeChipActive]}
                  onPress={() => setOfficerId(officer.id)}
                >
                  <ThemedText
                    style={[
                      styles.typeChipText,
                      officerId === officer.id && styles.typeChipTextActive,
                    ]}
                  >
                    {officer.full_name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <ThemedText style={styles.fieldLabel}>Period</ThemedText>
        <View style={styles.typeRow}>
          {REPORT_PERIOD_PRESETS.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.typeChip, periodPreset === p.id && styles.typeChipActive]}
              onPress={() => setPeriodPreset(p.id)}
            >
              <ThemedText
                style={[styles.typeChipText, periodPreset === p.id && styles.typeChipTextActive]}
              >
                {p.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {periodPreset === 'custom' ? (
          <View style={styles.customRow}>
            <View style={styles.customField}>
              <ThemedText style={styles.fieldLabel}>From (YYYY-MM-DD)</ThemedText>
              <TextInput
                style={styles.input}
                value={customFrom}
                onChangeText={setCustomFrom}
                autoCapitalize="none"
                placeholder="2026-07-01"
                placeholderTextColor={ClientUI.colors.textMuted}
              />
            </View>
            <View style={styles.customField}>
              <ThemedText style={styles.fieldLabel}>To (YYYY-MM-DD)</ThemedText>
              <TextInput
                style={styles.input}
                value={customTo}
                onChangeText={setCustomTo}
                autoCapitalize="none"
                placeholder="2026-07-31"
                placeholderTextColor={ClientUI.colors.textMuted}
              />
            </View>
          </View>
        ) : null}

        <Pressable
          style={[styles.primaryBtn, (busy || apiReady === false) && styles.btnDisabled]}
          disabled={busy || apiReady === false}
          onPress={() => void onGenerate()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="description" size={18} color="#fff" />
              <ThemedText style={styles.primaryBtnText}>Generate ({generatePeriodLabel})</ThemedText>
            </>
          )}
        </Pressable>
      </View>

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      <ThemedText style={styles.sectionTitle}>
        {isCio || isOpsManager ? 'Inbox & history' : 'My reports'}
        {total > 0 ? ` (${total})` : ''}
      </ThemedText>
      {isCio || isOpsManager ? (
        <View style={styles.typeRow}>
          <Pressable
            style={[styles.typeChip, listMode === 'inbox' && styles.typeChipActive]}
            onPress={() => setListMode('inbox')}
          >
            <ThemedText
              style={[styles.typeChipText, listMode === 'inbox' && styles.typeChipTextActive]}
            >
              Inbox ({inbox.length})
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.typeChip, listMode === 'all' && styles.typeChipActive]}
            onPress={() => setListMode('all')}
          >
            <ThemedText
              style={[styles.typeChipText, listMode === 'all' && styles.typeChipTextActive]}
            >
              All ({items.length})
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={18} color={ClientUI.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search title, status, type, officer, dates…"
            placeholderTextColor={ClientUI.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <ThemedText style={styles.fieldLabel}>Filter by type</ThemedText>
        <View style={styles.typeRow}>
          <Pressable
            style={[styles.typeChip, listTypeFilter === 'ALL' && styles.typeChipActive]}
            onPress={() => setListTypeFilter('ALL')}
          >
            <ThemedText
              style={[styles.typeChipText, listTypeFilter === 'ALL' && styles.typeChipTextActive]}
            >
              All
            </ThemedText>
          </Pressable>
          {REPORT_TYPES.map((t) => (
            <Pressable
              key={`list-${t.id}`}
              style={[styles.typeChip, listTypeFilter === t.id && styles.typeChipActive]}
              onPress={() => setListTypeFilter(t.id)}
            >
              <ThemedText
                style={[
                  styles.typeChipText,
                  listTypeFilter === t.id && styles.typeChipTextActive,
                ]}
              >
                {t.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <ThemedText style={styles.fieldLabel}>Filter by period coverage</ThemedText>
        <View style={styles.typeRow}>
          <Pressable
            style={[styles.typeChip, listPeriodPreset === 'all' && styles.typeChipActive]}
            onPress={() => setListPeriodPreset('all')}
          >
            <ThemedText
              style={[
                styles.typeChipText,
                listPeriodPreset === 'all' && styles.typeChipTextActive,
              ]}
            >
              Any
            </ThemedText>
          </Pressable>
          {REPORT_PERIOD_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
            <Pressable
              key={`list-period-${p.id}`}
              style={[styles.typeChip, listPeriodPreset === p.id && styles.typeChipActive]}
              onPress={() => setListPeriodPreset(p.id)}
            >
              <ThemedText
                style={[
                  styles.typeChipText,
                  listPeriodPreset === p.id && styles.typeChipTextActive,
                ]}
              >
                {p.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      {loading && !visibleReports.length ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={ClientUI.colors.primary} />
      ) : visibleReports.length === 0 ? (
        <ThemedText style={styles.muted}>
          {debouncedSearch || listTypeFilter !== 'ALL' || listPeriodPreset !== 'all'
            ? 'No CRB reports match your filters.'
            : 'No CRB reports yet.'}
        </ThemedText>
      ) : (
        visibleReports.map((report) => (
          <View key={report.id} style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <ThemedText style={styles.reportTitle}>{report.title}</ThemedText>
              <View style={[styles.statusPill, { backgroundColor: statusColor(report.status) }]}>
                <ThemedText style={styles.statusPillText}>{report.status}</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.muted}>{summarizeCrbReport(report)}</ThemedText>
            {crbScopeLabel(report) ? (
              <ThemedText style={styles.muted}>{crbScopeLabel(report)}</ThemedText>
            ) : null}
            {formatPeriodLabel(report) ? (
              <ThemedText style={styles.muted}>Period {formatPeriodLabel(report)}</ThemedText>
            ) : null}
            {report.loan_officer_name && !isLoanOfficer ? (
              <ThemedText style={styles.muted}>Book: {report.loan_officer_name}</ThemedText>
            ) : null}
            {report.generated_by_name && isCio ? (
              <ThemedText style={styles.muted}>From {report.generated_by_name}</ThemedText>
            ) : null}
            {report.forwarded_to_cio_name && isLoanOfficer ? (
              <ThemedText style={styles.muted}>To {report.forwarded_to_cio_name}</ThemedText>
            ) : null}
            {report.cio_notes ? (
              <ThemedText style={styles.notes}>CIO: {report.cio_notes}</ThemedText>
            ) : null}
            <View style={styles.actions}>
              {isLoanOfficer &&
              (report.status === 'GENERATED' || report.status === 'RETURNED') ? (
                <Pressable style={styles.secondaryBtn} onPress={() => openForward(report)}>
                  <MaterialIcons name="send" size={16} color={ClientUI.colors.primary} />
                  <ThemedText style={styles.secondaryBtnText}>Forward to CIO</ThemedText>
                </Pressable>
              ) : null}
              {isOpsOfficer &&
              (report.status === 'GENERATED' || report.status === 'RETURNED') ? (
                <Pressable style={styles.secondaryBtn} onPress={() => openSubmit(report)}>
                  <MaterialIcons name="send" size={16} color={ClientUI.colors.primary} />
                  <ThemedText style={styles.secondaryBtnText}>Submit to manager</ThemedText>
                </Pressable>
              ) : null}
              {(isCio && report.status === 'FORWARDED_TO_CIO') ||
              (isOpsManager && report.status === 'FORWARDED_TO_MANAGER') ? (
                <>
                  <Pressable style={styles.secondaryBtn} onPress={() => onAcknowledge(report)}>
                    <MaterialIcons name="check-circle" size={16} color={ClientUI.colors.primary} />
                    <ThemedText style={styles.secondaryBtnText}>Acknowledge</ThemedText>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={() => onReturn(report)}>
                    <MaterialIcons name="undo" size={16} color="#C62828" />
                    <ThemedText style={[styles.secondaryBtnText, { color: '#C62828' }]}>
                      Return
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        ))
      )}

      <Modal visible={forwardOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.sectionTitle}>Forward to CIO</ThemedText>
            <ThemedText style={styles.muted}>{forwardTarget?.title}</ThemedText>
            <ScrollView style={{ maxHeight: 180, marginTop: 12 }}>
              {cios.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.cioRow, selectedCioId === c.id && styles.cioRowActive]}
                  onPress={() => setSelectedCioId(c.id)}
                >
                  <ThemedText style={styles.cioName}>
                    {c.full_name}
                    {c.is_supervisor ? ' (supervisor)' : ''}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Optional message"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={forwardMessage}
              onChangeText={setForwardMessage}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setForwardOpen(false)}>
                <ThemedText style={styles.secondaryBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void onForward()}
              >
                <ThemedText style={styles.primaryBtnText}>Forward</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={submitOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.sectionTitle}>Submit to Operations Manager</ThemedText>
            <ThemedText style={styles.muted}>{submitTarget?.title}</ThemedText>
            <ScrollView style={{ maxHeight: 180, marginTop: 12 }}>
              {managers.map((m) => (
                <Pressable
                  key={m.id}
                  style={[styles.cioRow, selectedManagerId === m.id && styles.cioRowActive]}
                  onPress={() => setSelectedManagerId(m.id)}
                >
                  <ThemedText style={styles.cioName}>
                    {m.full_name}
                    {m.is_supervisor ? ' (supervisor)' : ''}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Optional message"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={submitMessage}
              onChangeText={setSubmitMessage}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setSubmitOpen(false)}>
                <ThemedText style={styles.secondaryBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void onSubmitToManager()}
              >
                <ThemedText style={styles.primaryBtnText}>Submit</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  generateCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ClientUI.colors.border,
  },
  searchCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ClientUI.colors.border,
  },
  sectionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    marginBottom: 8,
    color: ClientUI.colors.text,
  },
  fieldLabel: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginBottom: 6,
    marginTop: 4,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  typeChipActive: { backgroundColor: ClientUI.colors.primary },
  typeChipText: { fontSize: 13, color: ClientUI.colors.text },
  typeChipTextActive: { color: '#fff', fontFamily: Fonts.sansSemiBold },
  customRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  customField: { flex: 1 },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold },
  btnDisabled: { opacity: 0.6 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ClientUI.colors.border,
  },
  secondaryBtnText: { color: ClientUI.colors.primary, fontSize: 13, fontFamily: Fonts.sansSemiBold },
  reportCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ClientUI.colors.border,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  reportTitle: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { color: '#fff', fontSize: 10, fontFamily: Fonts.sansSemiBold },
  muted: { color: ClientUI.colors.textMuted, fontSize: 13, marginTop: 2 },
  notes: { color: ClientUI.colors.text, fontSize: 12, marginTop: 6 },
  error: { color: ClientUI.colors.danger, marginBottom: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ClientUI.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: ClientUI.colors.text,
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  cioRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#F3F4F6',
  },
  cioRowActive: { backgroundColor: '#E8F0FE' },
  cioName: { fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.text },
  input: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ClientUI.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
});
