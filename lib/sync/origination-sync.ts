import type { LoanOriginationTransitionBody } from '@/lib/data/api';
import { enqueueSync, tryRunSyncIfOnline } from '@/lib/sync/sync-service';

export async function enqueueOriginationTransition(
  applicationId: number,
  body: LoanOriginationTransitionBody,
  opts?: { remoteId?: number }
): Promise<void> {
  await enqueueSync('ORIGINATION_TRANSITION', 'application', applicationId, {
    local_application_id: applicationId,
    remote_id: opts?.remoteId,
    action: body.action,
    reason: body.reason,
    approved_amount: body.approved_amount,
    approved_term_months: body.approved_term_months,
    interest_rate: body.interest_rate,
  });
  await tryRunSyncIfOnline();
}
