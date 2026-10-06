import {
  defaultCustomRange,
  parseDateInput,
  resolveReportPeriod,
} from '@/lib/staff/report-period';

describe('report period helpers', () => {
  const now = new Date(2026, 7, 5, 15, 0, 0); // 5 Aug 2026

  it('resolves weekly / fortnight / 30-day presets', () => {
    const week = resolveReportPeriod('7d', undefined, undefined, now);
    expect('error' in week).toBe(false);
    if ('error' in week) return;
    expect(week.dateFrom.getDate()).toBe(30); // 30 Jul
    expect(week.label).toBe('last 7 days');

    const fort = resolveReportPeriod('14d', undefined, undefined, now);
    expect('error' in fort).toBe(false);
    if ('error' in fort) return;
    expect(fort.dateFrom.getDate()).toBe(23);

    const monthish = resolveReportPeriod('30d', undefined, undefined, now);
    expect('error' in monthish).toBe(false);
    if ('error' in monthish) return;
    expect(monthish.label).toBe('last 30 days');
  });

  it('resolves calendar month and quarter', () => {
    const tm = resolveReportPeriod('this_month', undefined, undefined, now);
    expect('error' in tm).toBe(false);
    if ('error' in tm) return;
    expect(tm.dateFrom.getMonth()).toBe(7);
    expect(tm.dateFrom.getDate()).toBe(1);

    const lm = resolveReportPeriod('last_month', undefined, undefined, now);
    expect('error' in lm).toBe(false);
    if ('error' in lm) return;
    expect(lm.dateFrom.getMonth()).toBe(6);
    expect(lm.dateTo.getMonth()).toBe(6);
    expect(lm.dateTo.getDate()).toBe(31);

    const q = resolveReportPeriod('this_quarter', undefined, undefined, now);
    expect('error' in q).toBe(false);
    if ('error' in q) return;
    expect(q.dateFrom.getMonth()).toBe(6); // Jul = Q3 start
    expect(q.dateFrom.getDate()).toBe(1);
  });

  it('validates custom range', () => {
    expect(resolveReportPeriod('custom', '', '', now)).toEqual({
      error: 'Enter both From and To dates as YYYY-MM-DD',
    });
    expect(resolveReportPeriod('custom', '2026-08-10', '2026-08-01', now)).toEqual({
      error: 'From date must be on or before To date',
    });
    const ok = resolveReportPeriod('custom', '2026-07-01', '2026-07-15', now);
    expect('error' in ok).toBe(false);
    if ('error' in ok) return;
    expect(ok.label).toBe('2026-07-01 – 2026-07-15');
  });

  it('parses date inputs and defaults custom range', () => {
    expect(parseDateInput('2026-08-05')?.getDate()).toBe(5);
    expect(parseDateInput('bad')).toBeNull();
    const range = defaultCustomRange(now);
    expect(range.to).toBe('2026-08-05');
    expect(range.from).toBe('2026-07-07');
  });
});
