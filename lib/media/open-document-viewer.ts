/**
 * Consistent navigation into the shared document viewer with auth-aware params.
 */

import type { Router } from 'expo-router';

import { config } from '@/lib/config';
import { resolveUploadUrl } from '@/lib/media/resolve-upload-url';

export type OpenDocumentViewerParams = {
  uri?: string;
  name?: string;
  docType?: string;
  appId?: string;
  /** Authenticated API stream path (e.g. /api/v1/mobile/loan-documents/12/file). */
  authApiUrl?: string;
};

/** Build Expo Router params for `/documents/[id]`. */
export function buildDocumentViewerHref(params: OpenDocumentViewerParams): {
  pathname: '/documents/[id]';
  params: Record<string, string>;
} {
  const raw = (params.authApiUrl || params.uri || '').trim();
  const resolved = params.authApiUrl
    ? params.authApiUrl.trim()
    : resolveUploadUrl(raw) ?? raw;
  const name =
    params.name?.trim() ||
    raw.split('?')[0].split('/').filter(Boolean).pop() ||
    'document';

  return {
    pathname: '/documents/[id]',
    params: {
      id: 'preview',
      // Pass raw URI — Expo Router encodes params; do not pre-encode.
      uri: resolved,
      name,
      ...(params.docType ? { docType: params.docType } : {}),
      ...(params.appId ? { appId: params.appId } : {}),
      ...(params.authApiUrl ? { authApi: '1' } : {}),
    },
  };
}

export function openDocumentViewer(router: Router, params: OpenDocumentViewerParams): void {
  router.push(buildDocumentViewerHref(params) as never);
}

/**
 * Staff loan / application document — always stream via the shared authenticated
 * file endpoint so CIO, LO, ops, and PM previews use the same path.
 */
export function staffLoanDocumentViewerParams(input: {
  documentId: number;
  name?: string;
  docType?: string;
  storedUrl?: string | null;
  appId?: string;
}): OpenDocumentViewerParams {
  return {
    name: input.name,
    docType: input.docType,
    appId: input.appId,
    authApiUrl: config.staff.loanDocumentFile(input.documentId),
    uri: input.storedUrl ?? undefined,
  };
}

export function openStaffLoanDocument(
  router: Router,
  input: {
    documentId: number;
    name?: string;
    docType?: string;
    storedUrl?: string | null;
    appId?: string;
  }
): void {
  openDocumentViewer(router, staffLoanDocumentViewerParams(input));
}
