import type { ApiScheduleItem } from '@/lib/data/api';

/** Remaining unpaid amount on a schedule installment (minor units). */
export function installmentRemaining(item: ApiScheduleItem): number {
  const total = Number(item.total_amount ?? 0);
  const paid = Number(item.paid_amount ?? 0);
  return Math.max(0, total - paid);
}

/** True when the installment still has an unpaid balance. */
export function isInstallmentOpen(item: ApiScheduleItem): boolean {
  const status = (item.status || '').toUpperCase();
  if (status === 'PAID' || status === 'COMPLETED' || status === 'WAIVED') return false;
  return installmentRemaining(item) > 0;
}
