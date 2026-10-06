/**
 * AI Studio client — direct FastAPI SSE (staff JWT).
 * Mirrors backCFADash/lib/ai-studio-stream.ts but targets /api/v1/ai-studio/*.
 */

import { api } from '@/lib/api-client';
import { config } from '@/lib/config';
import { getStoredAuth } from '@/lib/storage';
import type {
  AiExecutorExecuteRequest,
  AiExecutorExecuteResult,
  AiExecutorPlanRequest,
  AiExecutorPlanResult,
  AiStudioCatalogResponse,
  AiStudioMessageOut,
  AiStudioQueryRequest,
  AiStudioResult,
  AiStudioSessionOut,
  StreamProgress,
} from '@/lib/ai-studio-types';

/** No overall cutoff — free OpenRouter models can think for several minutes. */

export type StreamAiStudioHandlers = {
  onProgress?: (progress: StreamProgress) => void;
  onTextDelta?: (delta: string, fullText: string) => void;
  onResult?: (result: AiStudioResult) => void;
  onError?: (message: string) => void;
};

function parseSseBlock(block: string): unknown | null {
  const dataLines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (!dataLines.length) return null;
  const raw = dataLines.join('\n').trim();
  if (!raw || raw === '[DONE]') return raw === '[DONE]' ? { type: 'done' } : null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeProgress(data: Record<string, unknown>): StreamProgress {
  return {
    stage: String(data.stage || ''),
    label: String(data.label || ''),
    detail: data.detail != null ? String(data.detail) : null,
    tool: data.tool != null ? String(data.tool) : undefined,
    module: data.module != null ? String(data.module) : undefined,
    status: data.status != null ? String(data.status) : undefined,
    citation_id: data.citation_id != null ? String(data.citation_id) : undefined,
    record_count:
      typeof data.record_count === 'number' ? data.record_count : undefined,
    agents: typeof data.agents === 'number' ? data.agents : undefined,
    mode: data.mode != null ? String(data.mode) : undefined,
  };
}

async function streamFetch(
  url: string,
  body: AiStudioQueryRequest | AiExecutorPlanRequest,
  token: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

export async function fetchAiStudioSessions(limit = 20): Promise<AiStudioSessionOut[]> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');
  return api.get<AiStudioSessionOut[]>(`/ai-studio/sessions?limit=${limit}`, auth.token);
}

export async function fetchAiStudioSessionMessages(
  sessionId: string
): Promise<AiStudioMessageOut[]> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');
  return api.get<AiStudioMessageOut[]>(`/ai-studio/sessions/${sessionId}/messages`, auth.token);
}

export async function fetchAiStudioCatalog(): Promise<AiStudioCatalogResponse> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');
  return api.get<AiStudioCatalogResponse>('/ai-studio/catalog', auth.token);
}

export async function postAiStudioQuery(body: AiStudioQueryRequest): Promise<AiStudioResult> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');
  return api.post<AiStudioResult>('/ai-studio/query', body, auth.token);
}

export async function postExecutorExecute(
  body: AiExecutorExecuteRequest
): Promise<AiExecutorExecuteResult> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');
  return api.post<AiExecutorExecuteResult>('/ai-studio/executor/execute', body, auth.token);
}

async function consumeSseStream<T extends AiStudioResult>(
  res: Response,
  handlers: StreamAiStudioHandlers,
  fallbackError: string
): Promise<{ result: T | null; text: string }> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { detail?: unknown; message?: string };
      message =
        (typeof err.detail === 'string' && err.detail) ||
        err.message ||
        message;
    } catch {
      /* ignore */
    }
    throw new Error(String(message || fallbackError));
  }

  const bodyStream = res.body;
  if (!bodyStream) {
    throw new Error('No response body from AI Studio stream');
  }

  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const state: { result: T | null; error: string | null } = {
    result: null,
    error: null,
  };

  const handlePart = (part: Record<string, unknown>) => {
    const type = String(part.type || '');
    if (type === 'data-progress') {
      const data = (part.data || {}) as Record<string, unknown>;
      handlers.onProgress?.(normalizeProgress(data));
      return;
    }
    if (type === 'text-delta') {
      const delta = String(part.delta || '');
      if (!delta) return;
      text += delta;
      handlers.onTextDelta?.(delta, text);
      return;
    }
    if (type === 'data-result') {
      const data = part.data as T;
      state.result = data;
      handlers.onResult?.(data as AiStudioResult);
      return;
    }
    if (type === 'error') {
      state.error = String(part.errorText || fallbackError);
      handlers.onError?.(state.error);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const block of parts) {
      if (!block.trim() || block.trim().startsWith(':')) continue;
      const parsed = parseSseBlock(block);
      if (!parsed || typeof parsed !== 'object') continue;
      handlePart(parsed as Record<string, unknown>);
    }
  }

  if (buffer.trim() && !buffer.trim().startsWith(':')) {
    const parsed = parseSseBlock(buffer);
    if (parsed && typeof parsed === 'object') {
      handlePart(parsed as Record<string, unknown>);
    }
  }

  if (state.error) {
    throw new Error(state.error);
  }
  return { result: state.result, text };
}

export async function streamAiStudioQuery(
  body: AiStudioQueryRequest,
  handlers: StreamAiStudioHandlers = {},
  signal?: AbortSignal
): Promise<{ result: AiStudioResult | null; text: string }> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');

  const res = await streamFetch(config.aiStudio.queryStream, body, auth.token, signal);
  return consumeSseStream<AiStudioResult>(res, handlers, 'Analysis failed');
}

export async function streamExecutorPlan(
  body: AiExecutorPlanRequest,
  handlers: StreamAiStudioHandlers = {},
  signal?: AbortSignal
): Promise<{ result: AiExecutorPlanResult | null; text: string }> {
  const auth = await getStoredAuth();
  if (!auth?.token) throw new Error('Sign in required.');

  const res = await streamFetch(config.aiStudio.executorPlanStream, body, auth.token, signal);
  return consumeSseStream<AiExecutorPlanResult>(res, handlers, 'Executor plan failed');
}
