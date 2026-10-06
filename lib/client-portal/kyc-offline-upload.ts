import type { KycUploadField } from '@/lib/client-portal/api';
import { enqueueSync } from '@/lib/sync/sync-service';
import { scopedGetItemOptional, scopedRemoveItem, scopedSetItem } from '@/lib/account-scope';

const KYC_UPLOAD_RESULTS_KEY = 'kyc_upload_sync_results';

export async function enqueueKycDocumentUpload(
  field: KycUploadField,
  localUri: string,
  fileName: string
): Promise<void> {
  await enqueueSync('CREATE_KYC_UPLOAD', 'kyc', field, {
    field,
    local_uri: localUri,
    file_name: fileName,
  });
  // Do not sync here — background upload waits for Save or reconnect.
}

export async function storeKycUploadResult(field: KycUploadField, path: string): Promise<void> {
  try {
    const raw = await scopedGetItemOptional(KYC_UPLOAD_RESULTS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[field] = path;
    await scopedSetItem(KYC_UPLOAD_RESULTS_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
}

/** Read and clear synced KYC upload paths (merge into form after background sync). */
export async function consumeKycUploadResults(): Promise<Partial<Record<KycUploadField, string>>> {
  try {
    const raw = await scopedGetItemOptional(KYC_UPLOAD_RESULTS_KEY);
    if (!raw) return {};
    await scopedRemoveItem(KYC_UPLOAD_RESULTS_KEY);
    return JSON.parse(raw) as Partial<Record<KycUploadField, string>>;
  } catch {
    return {};
  }
}
