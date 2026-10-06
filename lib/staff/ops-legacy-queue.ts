export const OPS_LEGACY_QUEUES = [
  'needs_verification',
  'sent_to_accountant',
  'archive',
] as const;

export type OpsLegacyQueue = (typeof OPS_LEGACY_QUEUES)[number];

export function normalizeOpsLegacyQueue(value: string | null | undefined): OpsLegacyQueue {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'archive' || raw === 'archived' || raw === 'zero_balance' || raw === 'zero-balance') {
    return 'archive';
  }
  if (
    raw === 'sent_to_accountant' ||
    raw === 'verified' ||
    raw === 'handed_off' ||
    raw === 'certified' ||
    raw === 'accountant'
  ) {
    return 'sent_to_accountant';
  }
  return 'needs_verification';
}

export function isOpsLegacyWorkQueue(queue: OpsLegacyQueue): boolean {
  return queue !== 'archive';
}

export function opsLegacyQueueLabel(queue: OpsLegacyQueue): string {
  if (queue === 'archive') return 'Archive';
  if (queue === 'sent_to_accountant') return 'Sent to accountant';
  return 'Needs verification';
}

export function opsLegacyQueueDescription(queue: OpsLegacyQueue): string {
  if (queue === 'archive') {
    return 'Only accountant-journaled legacy loans with a MWK 0 remaining balance. Any principal or interest left outstanding stays on Repayments and never archives.';
  }
  if (queue === 'sent_to_accountant') {
    return 'Certified, verified, or handed-off loans that the accountant has not journaled yet.';
  }
  return 'Loans that still need operations reconcile or certification. Remaining balances sort first; MWK 0 rows stay at the end.';
}
