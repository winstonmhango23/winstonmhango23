/**
 * Queue the borrower's KYC answers when the form is submitted without a signal.
 * Documents are queued separately (CREATE_KYC_UPLOAD) and sync first, so this
 * row only has to carry the field values.
 */

import { enqueueSync } from '@/lib/sync/sync-service';

import type { ClientKYCData } from './kyc-completion-calculator';

export async function queueMobileKycSave(kyc: ClientKYCData): Promise<void> {
  await enqueueSync('SAVE_CLIENT_KYC', 'kyc', 'self', { kyc });
}
