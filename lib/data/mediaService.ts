/**
 * Media/document upload service – upload collateral and loan documents to Railway bucket.
 * Adapted from Batterfly social platform. Returns storage key for use in collateral/create.
 */

import { api } from '@/lib/api-client';
import { config } from '@/lib/config';

export type DocumentUploadResponse = {
  key: string;
  url: string;
  content_type: string;
  file_name?: string;
};

function getMimeFromNameOrUri(nameOrUri: string): string | null {
  const base = nameOrUri.split('?')[0];
  const ext = base.split('.').pop()?.toLowerCase();
  if (!ext || ext === base.toLowerCase()) return null;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return null;
}

/**
 * Upload a document (PDF or image) for collateral or loan application.
 * Returns the storage key to pass in document_keys when creating collateral.
 */
export async function uploadCollateralDocument(
  uri: string,
  token: string,
  options?: {
    fileName?: string;
    docType?: string;
    mimeType?: string;
    audience?: 'staff' | 'client';
    prefix?: string;
  }
): Promise<DocumentUploadResponse> {
  const filename = uri.split('/').pop() ?? `document-${Date.now()}.pdf`;
  const name = options?.fileName ?? (filename.includes('.') ? filename : `${filename}.pdf`);
  // Prefer filename / explicit mime — content:// URIs often have no extension.
  const mime =
    options?.mimeType ||
    getMimeFromNameOrUri(name) ||
    getMimeFromNameOrUri(uri) ||
    'image/jpeg';

  const formData = new FormData();
  formData.append('file', {
    uri,
    name,
    type: mime,
  } as unknown as Blob);

  const params = new URLSearchParams({ prefix: options?.prefix ?? 'collateral' });
  const path =
    options?.audience === 'client'
      ? `${config.customer.mediaUpload}?${params.toString()}`
      : `/media/upload?${params.toString()}`;
  const res = await api.postForm<DocumentUploadResponse>(path, formData, token);
  return res;
}

/** Staff document picker upload → storage URL for client/loan document records. */
export async function uploadStaffDocumentFile(
  uri: string,
  token: string,
  options?: { fileName?: string; prefix?: string }
): Promise<DocumentUploadResponse> {
  return uploadCollateralDocument(uri, token, {
    fileName: options?.fileName,
    audience: 'staff',
    prefix: options?.prefix ?? 'documents',
  });
}
