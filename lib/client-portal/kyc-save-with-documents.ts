/**
 * Upload locally captured KYC files only when the user taps Save,
 * then persist the KYC record (online-first, queue if offline).
 * Capture/pick must never call this — that is what caused the spinner
 * while loan officers were still attaching photos.
 */

import { isLocalMediaUri } from '@/lib/media/authenticated-media';
import { persistOfflineMedia } from '@/lib/media/offline-media-store';
import { compressImageForUpload } from '@/lib/media/compress-image';
import { isPdfPath } from '@/lib/media/resolve-upload-url';
import { enqueueKycDocumentUpload } from '@/lib/client-portal/kyc-offline-upload';
import { queueMobileKycSave } from '@/lib/client-portal/kyc-offline-save';
import { runOnlineFirstRemote } from '@/lib/online-first-remote';
import { getPendingSyncCount, runSyncIfOnline } from '@/lib/sync/sync-service';
import type { ClientKYCData } from '@/lib/client-portal/kyc-completion-calculator';
import type { KycUploadField } from '@/lib/client-portal/api';
import { saveMobileKyc, uploadMobileKycDocument } from '@/lib/client-portal/api';

const KYC_DOC_FIELDS: KycUploadField[] = [
  'profile_photo_path',
  'id_document_path',
  'id_document_back_path',
  'group_constitution_path',
  'group_photo_path',
];

function fileNameFor(field: KycUploadField, uri: string): string {
  const fromUri = uri.split('/').pop();
  if (fromUri && fromUri.includes('.')) return fromUri;
  return `${field.replace(/_path$/, '')}.jpg`;
}

function isQueuedPlaceholder(value?: string | null): boolean {
  return Boolean(value?.startsWith('queued:'));
}

async function durableLocalFile(
  field: KycUploadField,
  uri: string
): Promise<{ uri: string; fileName: string }> {
  const persisted = await persistOfflineMedia(uri, { name: fileNameFor(field, uri) });
  if (isPdfPath(persisted) || isPdfPath(fileNameFor(field, persisted))) {
    return { uri: persisted, fileName: fileNameFor(field, persisted) };
  }
  const compressed = await compressImageForUpload(persisted);
  const durable = await persistOfflineMedia(compressed.uri, {
    name: compressed.name ?? fileNameFor(field, persisted),
  });
  return { uri: durable, fileName: compressed.name ?? fileNameFor(field, durable) };
}

export async function persistKycDocumentsThenSave(
  token: string,
  kyc: ClientKYCData,
  localPreviews: Partial<Record<KycUploadField, string>>
): Promise<'online' | 'queued'> {
  const next: ClientKYCData = { ...kyc };
  const pendingUploads: { field: KycUploadField; uri: string; fileName: string }[] = [];

  for (const field of KYC_DOC_FIELDS) {
    const candidate = localPreviews[field] || (next[field] as string | undefined);
    if (!candidate || isQueuedPlaceholder(candidate) || !isLocalMediaUri(candidate)) continue;
    pendingUploads.push({ field, ...(await durableLocalFile(field, candidate)) });
  }

  const remote = await runOnlineFirstRemote('saveKycWithDocuments', async () => {
    for (const doc of pendingUploads) {
      const uploaded = await uploadMobileKycDocument(token, doc.uri, doc.field, doc.fileName);
      next[doc.field] = uploaded.path;
    }
    await saveMobileKyc(token, next);
    return true;
  });

  if (remote.ok) return 'online';

  for (const doc of pendingUploads) {
    await enqueueKycDocumentUpload(doc.field, doc.uri, doc.fileName);
    next[doc.field] = `queued:${doc.field}`;
  }
  await queueMobileKycSave(next);

  // User explicitly tapped Save — try once more in case the link recovered.
  await runSyncIfOnline({ forceNetworkCheck: true });
  const pending = await getPendingSyncCount();
  return pending === 0 ? 'online' : 'queued';
}
