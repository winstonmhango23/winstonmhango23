/**
 * Borrower portal — only these routes belong in the bottom tab bar.
 * Stack-only flows live under app/(client)/(stacks)/ (href: null on the group).
 */

export const CLIENT_VISIBLE_TAB_NAMES = [
  'index',
  'applications',
  'loans',
  'repayments',
  'accounts',
  'notifications',
  'profile',
] as const;

/** Route group for stack-only borrower screens (sync, KYC, property, etc.). */
export const CLIENT_STACKS_GROUP_NAME = '(stacks)' as const;

/** Segments that should hide the tab bar while active (includes the stacks group). */
export const CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS = [
  CLIENT_STACKS_GROUP_NAME,
  'sync',
  'kyc',
  'group-members',
  'group-member-logins',
  'group-leaders',
  'collateral-vault',
  'documents',
  'guarantors',
  'property',
] as const;

/** @deprecated Use CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS */
export const CLIENT_TAB_BAR_HIDE_SEGMENTS = CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS;

/** @deprecated Stack routes moved under (stacks); only the group is registered on Tabs */
export const CLIENT_HIDDEN_TAB_NAMES = [CLIENT_STACKS_GROUP_NAME] as const;
