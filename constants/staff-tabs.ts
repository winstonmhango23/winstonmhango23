/**
 * Loan-officer mobile shell — only these routes appear in the bottom tab bar.
 * All other routes under app/(staff)/ remain reachable via navigation but are hidden from tabs.
 */

export const STAFF_VISIBLE_TAB_NAMES = [
  'index',
  'applications',
  'clients',
  'loans',
  'repayments',
  'notifications',
  'profile',
] as const;

/** Route segment names that live outside the loan-officer tab bar (executive / back-office). */
export const STAFF_WORKSPACE_TAB_NAMES = [
  '(workspaces)',
] as const;

/** When active, the bottom tab bar is hidden (workspace stacks + sync detail). */
export const STAFF_TAB_BAR_HIDE_SEGMENTS = [
  '(workspaces)',
  'sync',
] as const;
