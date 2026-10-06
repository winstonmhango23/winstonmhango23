/**
 * AI Studio — premium mobile staff workspace (direct FastAPI + SSE).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AiStudioComposer } from '@/components/ai-studio/ai-studio-composer';
import { AiStudioExecutorPanel } from '@/components/ai-studio/ai-studio-executor-panel';
import { AiStudioHero } from '@/components/ai-studio/ai-studio-hero';
import { AiStudioProgressOverlay } from '@/components/ai-studio/ai-studio-progress-overlay';
import { AiStudioResultsView } from '@/components/ai-studio/ai-studio-results-view';
import { AiStudioSessionStrip } from '@/components/ai-studio/ai-studio-session-strip';
import { AiStudioTemplateGallery } from '@/components/ai-studio/ai-studio-template-gallery';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { hapticError, hapticSuccess } from '@/lib/ai-studio-haptics';
import {
  fetchAiStudioCatalog,
  fetchAiStudioSessionMessages,
  fetchAiStudioSessions,
  postExecutorExecute,
  streamAiStudioQuery,
  streamExecutorPlan,
} from '@/lib/ai-studio-stream';
import type {
  AiExecutorAction,
  AiExecutorExecuteResult,
  AiExecutorPlanResult,
  AiStudioCatalogItem,
  AiStudioCatalogResponse,
  AiStudioResult,
  PresentationStyle,
  ProgressEvent,
  QueryMode,
  AiStudioSessionOut,
  StreamProgress,
} from '@/lib/ai-studio-types';
import { isExecutorPlanResult } from '@/lib/ai-studio-types';

let progressSeq = 0;

function toProgressEvent(progress: StreamProgress): ProgressEvent {
  progressSeq += 1;
  return { ...progress, id: `pe-${progressSeq}`, timestamp: Date.now() };
}

export function AiStudioScreen() {
  const [catalog, setCatalog] = useState<AiStudioCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AiStudioSessionOut[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<QueryMode>('analytical');
  const [presentation, setPresentation] = useState<PresentationStyle>('dashboard');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [latestProgress, setLatestProgress] = useState<StreamProgress | null>(null);
  const [narrative, setNarrative] = useState('');
  const [result, setResult] = useState<AiStudioResult | AiExecutorPlanResult | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [proposedActions, setProposedActions] = useState<AiExecutorAction[]>([]);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<AiExecutorExecuteResult | null>(null);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string>('');

  const loadCatalog = useCallback(async () => {
    setCatalogError(null);
    setCatalogLoading(true);
    try {
      const data = await fetchAiStudioCatalog();
      setCatalog(data);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const rows = await fetchAiStudioSessions(12);
      setSessions(rows);
    } catch {
      /* optional */
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadSessions();
    return () => {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      abortRef.current?.abort();
    };
  }, [loadCatalog, loadSessions]);

  const applyTemplate = useCallback((item: AiStudioCatalogItem, prompt: string) => {
    setSelectedTemplateId(item.id);
    setMode(item.mode);
    setPresentation(item.presentation);
    setQuestion(prompt);
  }, []);

  const dismissOverlay = useCallback(() => {
    setOverlayOpen(false);
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const stopQuery = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setOverlayOpen(false);
  }, []);

  const runQuery = useCallback(
    async (overrideQuestion?: string) => {
      const q = (overrideQuestion ?? question).trim();
      if (q.length < 4) {
        Alert.alert('Question required', 'Enter at least 4 characters.');
        return;
      }
      setQueryError(null);
      lastQuestionRef.current = q;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setOverlayOpen(true);
      setShowResults(true);
      setProgressEvents([]);
      setLatestProgress(null);
      setNarrative('');
      setResult(null);
      setPlanId(null);
      setProposedActions([]);
      setExecuteResult(null);
      setActiveCitationId(null);
      progressSeq = 0;

      try {
        const isExecutor = mode === 'executor';
        const handlers = {
          onProgress: (p: StreamProgress) => {
            setLatestProgress(p);
            setProgressEvents((prev) => [...prev, toProgressEvent(p)]);
          },
          onTextDelta: (_d: string, full: string) => setNarrative(full),
          onResult: (r: AiStudioResult) => {
            setResult(r);
            if (isExecutorPlanResult(r)) {
              setPlanId(r.plan_id ?? null);
              setProposedActions(r.proposed_actions ?? []);
            }
          },
        };

        if (isExecutor) {
          const { result: streamed } = await streamExecutorPlan(
            { question: q, presentation, session_id: sessionId },
            handlers,
            controller.signal
          );
          if (streamed) {
            setResult(streamed);
            setPlanId(streamed.plan_id ?? null);
            setProposedActions(streamed.proposed_actions ?? []);
          }
        } else {
          const { result: streamed } = await streamAiStudioQuery(
            {
              question: q,
              mode,
              presentation,
              session_id: sessionId,
            },
            handlers,
            controller.signal
          );
          if (streamed) setResult(streamed);
        }
        hapticSuccess();
        void loadSessions();
        finishTimerRef.current = setTimeout(() => setOverlayOpen(false), 2400);
      } catch (err) {
        if (controller.signal.aborted) return;
        setOverlayOpen(false);
        hapticError();
        // Persistent error surface with retry — an Alert alone vanishes and
        // strands the officer with a blank results area.
        setQueryError(err instanceof Error && err.message ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [question, mode, presentation, sessionId, loadSessions]
  );

  const confirmExecutor = useCallback(
    async (selected: AiExecutorAction[]) => {
      if (!selected.length) return;
      setExecuting(true);
      try {
        const res = await postExecutorExecute({
          plan_id: planId,
          session_id: sessionId,
          confirmed_actions: selected.map((a) => ({
            action_id: a.action_id,
            action_type: a.action_type,
            params: a.params,
          })),
        });
        setExecuteResult(res);
        hapticSuccess();
        if (res.failed_count) hapticError();
      } catch (err) {
        hapticError();
        Alert.alert('Execution failed', err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setExecuting(false);
      }
    },
    [planId, sessionId]
  );

  const resetExecutor = useCallback(() => {
    setExecuteResult(null);
    setProposedActions([]);
    setPlanId(null);
    setResult(null);
    setNarrative('');
  }, []);

  const runTemplate = useCallback(
    (item: AiStudioCatalogItem, prompt: string) => {
      applyTemplate(item, prompt);
      void runQuery(prompt);
    },
    [applyTemplate, runQuery]
  );

  const openSession = useCallback(async (session: AiStudioSessionOut) => {
    try {
      const messages = await fetchAiStudioSessionMessages(session.id);
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      setSessionId(session.id);
      setMode((session.mode as QueryMode) || 'analytical');
      setQuestion(lastUser?.content_markdown ?? '');
      if (lastAssistant?.result_json) {
        setResult(lastAssistant.result_json);
        setNarrative(lastAssistant.content_markdown);
        if (isExecutorPlanResult(lastAssistant.result_json)) {
          setPlanId(lastAssistant.result_json.plan_id ?? null);
          setProposedActions(lastAssistant.result_json.proposed_actions ?? []);
        }
        setShowResults(true);
      } else {
        setNarrative(lastAssistant?.content_markdown ?? '');
        setShowResults(!!lastAssistant);
      }
    } catch (err) {
      Alert.alert('Session', err instanceof Error ? err.message : 'Could not load session');
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCatalog(), loadSessions()]);
    setRefreshing(false);
  }, [loadCatalog, loadSessions]);

  const isFinishing = !loading && latestProgress?.stage === 'complete';
  const templates = catalog?.catalog ?? [];

  return (
    <StaffDetailScreen
      title="AI Studio"
      subtitle="Premium MFI analytics"
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <AiStudioProgressOverlay
        open={overlayOpen}
        events={progressEvents}
        onDismiss={dismissOverlay}
        finishing={isFinishing}
      />

      <AiStudioHero role={catalog?.role} moduleCount={catalog?.allowed_modules?.length ?? 0} />

      <AiStudioSessionStrip
        sessions={sessions}
        loading={sessionsLoading}
        onRefresh={loadSessions}
        onSelect={openSession}
      />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Analysis templates</ThemedText>
          <ThemedText style={styles.sectionHint}>Tap a prompt or run instantly</ThemedText>
        </View>
        <AiStudioTemplateGallery
          templates={templates}
          loading={catalogLoading}
          selectedId={selectedTemplateId}
          running={loading}
          onSelect={applyTemplate}
          onRun={runTemplate}
        />
        {catalogError ? (
          <Pressable onPress={loadCatalog} style={styles.errorRow}>
            <MaterialIcons name="error-outline" size={16} color={ClientUI.colors.danger} />
            <ThemedText style={styles.errorText}>{catalogError} — tap to retry</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {selectedTemplateId ? (
        <View style={styles.templateChipRow}>
          <MaterialIcons name="check-circle" size={14} color={ClientUI.colors.primary} />
          <ThemedText style={styles.templateChipText} numberOfLines={1}>
            Template: {templates.find((t) => t.id === selectedTemplateId)?.label ?? 'selected'}
          </ThemedText>
          <Pressable onPress={() => setSelectedTemplateId(null)} hitSlop={8}>
            <MaterialIcons name="close" size={14} color={ClientUI.colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <AiStudioComposer
        question={question}
        mode={mode}
        presentation={presentation}
        loading={loading}
        onChangeQuestion={(value) => {
          setQuestion(value);
          // Manual edits mean the officer is writing their own question —
          // drop the template highlight so the UI reflects reality.
          setSelectedTemplateId(null);
        }}
        onRun={() => void runQuery()}
        onStop={stopQuery}
        onQuickPrompt={(q: string) => {
          setQuestion(q);
          void runQuery(q);
        }}
      />

      {loading && latestProgress ? (
        <Pressable style={styles.liveBanner} onPress={() => setOverlayOpen(true)}>
          <MaterialIcons name="insights" size={16} color={ClientUI.colors.primary} />
          <ThemedText style={styles.liveText}>{latestProgress.label}</ThemedText>
          <ThemedText style={styles.liveLink}>View live</ThemedText>
        </Pressable>
      ) : null}

      {queryError && !loading ? (
        <View style={styles.queryErrorCard}>
          <MaterialIcons name="error-outline" size={18} color={ClientUI.colors.danger} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.queryErrorTitle}>Analysis failed</ThemedText>
            <ThemedText style={styles.queryErrorText}>{queryError}</ThemedText>
          </View>
          <Pressable
            style={styles.retryBtn}
            onPress={() => void runQuery(lastQuestionRef.current || undefined)}
          >
            <MaterialIcons name="refresh" size={16} color="#fff" />
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {showResults && (narrative || result || loading) ? (
        <>
          {(proposedActions.length > 0 || executeResult) && (
            <AiStudioExecutorPanel
              planId={planId}
              actions={proposedActions}
              executing={executing}
              executeResult={executeResult}
              onConfirm={confirmExecutor}
              onReset={resetExecutor}
            />
          )}
          <AiStudioResultsView
            narrative={narrative}
            result={result}
            streaming={loading && !!narrative}
            activeCitationId={activeCitationId}
            onCitationPress={setActiveCitationId}
            proposedActions={proposedActions}
          />
        </>
      ) : null}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  sectionHeader: { marginBottom: 10, gap: 2 },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  sectionHint: { fontSize: 12, color: ClientUI.colors.textMuted },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  errorText: { fontSize: 12, color: ClientUI.colors.danger },
  templateChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: ClientUI.colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    maxWidth: '100%',
  },
  templateChipText: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: Fonts.sansSemiBold,
    color: ClientUI.colors.primary,
  },
  queryErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.danger,
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  queryErrorTitle: { fontSize: 13, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.danger },
  queryErrorText: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: { color: '#fff', fontSize: 12, fontFamily: Fonts.sansSemiBold },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.primarySoft,
    marginBottom: 12,
  },
  liveText: { flex: 1, fontSize: 12, fontFamily: Fonts.sansSemiBold },
  liveLink: { fontSize: 12, color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
});
