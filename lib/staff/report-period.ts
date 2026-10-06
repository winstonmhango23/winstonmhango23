/**
 * Shared report period presets for CRB / staff report generation and list filters.
 */

export type ReportPeriodPresetId =
  | '7d'
  | '14d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'custom';

export type ReportPeriodPreset = {
  id: ReportPeriodPresetId;
  label: string;
};

export const REPORT_PERIOD_PRESETS: ReportPeriodPreset[] = [
  { id: '7d', label: 'Weekly' },
  { id: '14d', label: 'Fortnight' },
  { id: '30d', label: '30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'Quarter' },
  { id: 'custom', label: 'Custom' },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateInput(value: string, endOfDayBound = false): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return endOfDayBound ? endOfDay(dt) : startOfDay(dt);
}

export function resolveReportPeriod(
  preset: ReportPeriodPresetId,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date()
): { dateFrom: Date; dateTo: Date; label: string } | { error: string } {
  const to = endOfDay(now);

  if (preset === 'custom') {
    const from = parseDateInput(customFrom || '', false);
    const until = parseDateInput(customTo || '', true);
    if (!from || !until) {
      return { error: 'Enter both From and To dates as YYYY-MM-DD' };
    }
    if (from.getTime() > until.getTime()) {
      return { error: 'From date must be on or before To date' };
    }
    return {
      dateFrom: from,
      dateTo: until,
      label: `${toDateInputValue(from)} – ${toDateInputValue(until)}`,
    };
  }

  if (preset === '7d' || preset === '14d' || preset === '30d') {
    const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
    const from = startOfDay(new Date(now));
    from.setDate(from.getDate() - (days - 1));
    const labels = { '7d': 'last 7 days', '14d': 'last 14 days', '30d': 'last 30 days' } as const;
    return { dateFrom: from, dateTo: to, label: labels[preset] };
  }

  if (preset === 'this_month') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { dateFrom: from, dateTo: to, label: 'this month' };
  }

  if (preset === 'last_month') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const until = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { dateFrom: from, dateTo: until, label: 'last month' };
  }

  // this_quarter
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const from = startOfDay(new Date(now.getFullYear(), quarterStartMonth, 1));
  return { dateFrom: from, dateTo: to, label: 'this quarter' };
}

export function defaultCustomRange(now: Date = new Date()): { from: string; to: string } {
  const to = toDateInputValue(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  return { from: toDateInputValue(fromDate), to };
}
