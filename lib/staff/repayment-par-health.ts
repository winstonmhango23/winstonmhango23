/**
 * Repayment-engine PAR snapshot helpers (dashboard BMS parity).
 * Matches backCFADash `types/repayment-par-health.ts` + panel severity bands.
 */

export type RepaymentParHealthSnapshot = {
  live_book_outstanding_minor?: number;
  live_active_loan_count?: number;
  all_active_loan_count?: number;
  all_active_outstanding_minor?: number;
  loans_awaiting_repayment_tracking_count?: number;
  par_30_outstanding_minor?: number;
  par_60_outstanding_minor?: number;
  par_90_outstanding_minor?: number;
  par_30_loan_count?: number;
  par_60_loan_count?: number;
  par_90_loan_count?: number;
  /** Amount-weighted PAR vs live-book outstanding (post TRACKING_REPAYMENT). */
  par_30_pct_of_live_book?: number;
  par_60_pct_of_live_book?: number;
  par_90_pct_of_live_book?: number;
  par_30_pct_of_live_loan_count?: number;
  scheduled_penalties_outstanding_minor?: number;
  loan_penalty_records_outstanding_minor?: number;
};

export type ParSeverity = 'healthy' | 'watch' | 'warn' | 'critical';

export type ParBucketKey = 'par30' | 'par60' | 'par90';

export type ParBucket = {
  key: ParBucketKey;
  label: string;
  pct: number | null;
  amountMinor: number;
  loanCount: number;
  severity: ParSeverity;
};

function asFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function asNonNegInt(raw: unknown): number {
  const n = asFiniteNumber(raw);
  if (n == null || n < 0) return 0;
  return Math.round(n);
}

/** Normalize loose API JSON into a typed snapshot (or null when empty). */
export function parseRepaymentParHealth(raw: unknown): RepaymentParHealthSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const snap: RepaymentParHealthSnapshot = {
    live_book_outstanding_minor: asNonNegInt(o.live_book_outstanding_minor),
    live_active_loan_count: asNonNegInt(o.live_active_loan_count),
    all_active_loan_count: asNonNegInt(o.all_active_loan_count),
    all_active_outstanding_minor: asNonNegInt(o.all_active_outstanding_minor),
    loans_awaiting_repayment_tracking_count: asNonNegInt(o.loans_awaiting_repayment_tracking_count),
    par_30_outstanding_minor: asNonNegInt(o.par_30_outstanding_minor),
    par_60_outstanding_minor: asNonNegInt(o.par_60_outstanding_minor),
    par_90_outstanding_minor: asNonNegInt(o.par_90_outstanding_minor),
    par_30_loan_count: asNonNegInt(o.par_30_loan_count),
    par_60_loan_count: asNonNegInt(o.par_60_loan_count),
    par_90_loan_count: asNonNegInt(o.par_90_loan_count),
    par_30_pct_of_live_book: asFiniteNumber(o.par_30_pct_of_live_book) ?? undefined,
    par_60_pct_of_live_book: asFiniteNumber(o.par_60_pct_of_live_book) ?? undefined,
    par_90_pct_of_live_book: asFiniteNumber(o.par_90_pct_of_live_book) ?? undefined,
    par_30_pct_of_live_loan_count: asFiniteNumber(o.par_30_pct_of_live_loan_count) ?? undefined,
    scheduled_penalties_outstanding_minor: asNonNegInt(o.scheduled_penalties_outstanding_minor),
    loan_penalty_records_outstanding_minor: asNonNegInt(o.loan_penalty_records_outstanding_minor),
  };
  const hasAny =
    snap.par_30_pct_of_live_book != null ||
    snap.par_60_pct_of_live_book != null ||
    snap.par_90_pct_of_live_book != null ||
    (snap.live_book_outstanding_minor ?? 0) > 0 ||
    (snap.live_active_loan_count ?? 0) > 0;
  return hasAny ? snap : null;
}

/** Severity bands match dashboard RepaymentParHealthPanel. */
export function parSeverity(pct: number | null | undefined): ParSeverity {
  if (pct == null || Number.isNaN(pct) || pct === 0) return 'healthy';
  if (pct < 5) return 'watch';
  if (pct < 10) return 'warn';
  return 'critical';
}

export function formatParPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct.toFixed(1)}%`;
}

export function parBuckets(snapshot: RepaymentParHealthSnapshot | null | undefined): ParBucket[] {
  if (!snapshot) return [];
  return [
    {
      key: 'par30',
      label: 'PAR 30+',
      pct: snapshot.par_30_pct_of_live_book ?? null,
      amountMinor: snapshot.par_30_outstanding_minor ?? 0,
      loanCount: snapshot.par_30_loan_count ?? 0,
      severity: parSeverity(snapshot.par_30_pct_of_live_book),
    },
    {
      key: 'par60',
      label: 'PAR 60+',
      pct: snapshot.par_60_pct_of_live_book ?? null,
      amountMinor: snapshot.par_60_outstanding_minor ?? 0,
      loanCount: snapshot.par_60_loan_count ?? 0,
      severity: parSeverity(snapshot.par_60_pct_of_live_book),
    },
    {
      key: 'par90',
      label: 'PAR 90+',
      pct: snapshot.par_90_pct_of_live_book ?? null,
      amountMinor: snapshot.par_90_outstanding_minor ?? 0,
      loanCount: snapshot.par_90_loan_count ?? 0,
      severity: parSeverity(snapshot.par_90_pct_of_live_book),
    },
  ];
}

/**
 * Concentration bands derived from cumulative PAR outstanding
 * (same differencing as dashboard PortfolioAnalyticsDashboard risk tab).
 */
export function parConcentrationBands(snapshot: RepaymentParHealthSnapshot | null | undefined): {
  label: string;
  amountMinor: number;
  color: string;
}[] {
  if (!snapshot) return [];
  const p30 = snapshot.par_30_outstanding_minor ?? 0;
  const p60 = snapshot.par_60_outstanding_minor ?? 0;
  const p90 = snapshot.par_90_outstanding_minor ?? 0;
  const live = snapshot.live_book_outstanding_minor ?? 0;
  const performing = Math.max(0, live - p30);
  return [
    { label: 'Performing (0–29)', amountMinor: performing, color: '#22c55e' },
    { label: '30–59 days', amountMinor: Math.max(0, p30 - p60), color: '#f59e0b' },
    { label: '60–89 days', amountMinor: Math.max(0, p60 - p90), color: '#f97316' },
    { label: '90+ days', amountMinor: Math.max(0, p90), color: '#ef4444' },
  ];
}

export function severityLabel(sev: ParSeverity): string {
  switch (sev) {
    case 'healthy':
      return 'Healthy';
    case 'watch':
      return 'Watch';
    case 'warn':
      return 'Elevated';
    case 'critical':
      return 'Critical';
  }
}
