import type { ApiScheduleItem } from '@/lib/data/api';

export type LoanScheduleRow = {
  installmentNumber: number;
  dueDate: string | null;
  principalMinor: number;
  interestMinor: number;
  totalMinor: number;
  status: string;
};

export function normalizeLoanScheduleRows(raw: unknown): LoanScheduleRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = (item ?? {}) as ApiScheduleItem & {
      installmentNumber?: number;
      dueDate?: string;
      principal?: number;
      interest?: number;
      totalAmount?: number;
    };
    return {
      installmentNumber: Number(row.installment_number ?? row.installmentNumber ?? index + 1) || index + 1,
      dueDate: row.due_date ?? row.dueDate ?? null,
      principalMinor: Number(row.principal_amount ?? row.principal ?? 0) || 0,
      interestMinor: Number(row.interest_amount ?? row.interest ?? 0) || 0,
      totalMinor: Number(row.total_amount ?? row.totalAmount ?? 0) || 0,
      status: String(row.status ?? 'PENDING'),
    };
  });
}
