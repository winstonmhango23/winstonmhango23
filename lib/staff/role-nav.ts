import type { TabletNavItem } from '@/components/navigation/tablet-nav-sidebar';
import {
  isAccountantStaffRole,
  isInternalAuditorStaffRole,
  isCeoStaffRole,
  isGceoStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
} from '@/lib/loan-origination/origination-workflow';

export type StaffTabKey =
  | 'index'
  | 'applications'
  | 'clients'
  | 'loans'
  | 'repayments'
  | 'notifications'
  | 'profile';

export type StaffTabOptions = {
  title: string;
  icon: TabletNavItem['icon'];
  href?: string | null;
};

export type StaffRoleNav = {
  title: string;
  sidebar: TabletNavItem[];
  tabs: Record<StaffTabKey, StaffTabOptions>;
};

const HIDDEN_TAB: StaffTabOptions = { title: '', icon: 'circle', href: null };

function alertsAndProfile(unreadCount: number): TabletNavItem[] {
  return [
    {
      href: '/(staff)/notifications',
      match: '/notifications',
      label: 'Alerts',
      icon: 'notifications',
      badge: unreadCount,
    },
    { href: '/(staff)/profile', match: '/profile', label: 'Profile', icon: 'person' },
  ];
}

function aiStudioNavItem(): TabletNavItem {
  return {
    href: '/(staff)/ai-studio',
    match: '/ai-studio',
    label: 'AI Studio',
    icon: 'auto-awesome',
  };
}

function loanOfficerNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Staff',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Digest', icon: 'dashboard' },
      { href: '/(staff)/applications', match: '/applications', label: 'Applications', icon: 'description' },
      { href: '/(staff)/clients', match: '/clients', label: 'Clients', icon: 'people' },
      { href: '/(staff)/loans', match: '/loans', label: 'Loans', icon: 'account-balance' },
      { href: '/(staff)/repayments', match: '/repayments', label: 'Payments', icon: 'payment' },
      aiStudioNavItem(),
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Digest', icon: 'dashboard' },
      applications: { title: 'Apps', icon: 'description' },
      clients: { title: 'Clients', icon: 'people' },
      loans: { title: 'Loans', icon: 'account-balance' },
      repayments: { title: 'Pay', icon: 'payment' },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function accountantNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Accountant',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'calculate' },
      {
        href: '/(staff)/accountant/journals?book=legacy&credit_book=SME',
        match: '/accountant/journals?book=legacy&credit_book=SME',
        label: 'SME book',
        icon: 'business',
      },
      {
        href: '/(staff)/accountant/journals?book=legacy&credit_book=GROUP',
        match: '/accountant/journals?book=legacy&credit_book=GROUP',
        label: 'Group book',
        icon: 'groups',
      },
      {
        href: '/(staff)/accountant/ready-to-disburse',
        match: '/accountant/ready-to-disburse',
        label: 'Ready to disburse',
        icon: 'playlist-add-check',
      },
      {
        href: '/(staff)/accountant/disbursements',
        match: '/accountant/disbursements',
        label: 'Disbursements',
        icon: 'payments',
      },
      {
        href: '/(staff)/accountant/ops-handoff',
        match: '/accountant/ops-handoff',
        label: 'Ops handoff',
        icon: 'send',
      },
      {
        href: '/(staff)/accountant/journals?book=legacy',
        match: '/accountant/journals',
        label: 'Legacy Booking',
        icon: 'menu-book',
      },
      {
        href: '/(staff)/accountant/journals?book=current',
        match: '/accountant/journals?book=current',
        label: 'Current Journals',
        icon: 'receipt-long',
      },
      {
        href: '/(staff)/accountant/repayments',
        match: '/accountant/repayments',
        label: 'Repayments',
        icon: 'account-balance-wallet',
      },
      aiStudioNavItem(),
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'calculate' },
      applications: {
        title: 'Disburse',
        icon: 'playlist-add-check',
        href: '/(staff)/accountant/ready-to-disburse',
      },
      clients: HIDDEN_TAB,
      loans: { title: 'Books', icon: 'account-balance' },
      repayments: {
        title: 'Ledger',
        icon: 'account-balance-wallet',
        href: '/(staff)/accountant/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function operationsOfficerNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Operations',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'dashboard' },
      {
        href: '/(staff)/loans?book=SME&vintage=legacy',
        match: '/loans?book=SME',
        label: 'SME legacy',
        icon: 'business',
      },
      {
        href: '/(staff)/loans?book=GROUP&vintage=legacy',
        match: '/loans?book=GROUP',
        label: 'Group legacy',
        icon: 'groups',
      },
      {
        href: '/(staff)/loans?vintage=legacy',
        match: '/loans?vintage=legacy',
        label: 'Legacy Booking',
        icon: 'menu-book',
      },
      {
        href: '/(staff)/operations/ops-queue',
        match: '/operations/ops-queue',
        label: 'Ops queue',
        icon: 'handshake',
      },
      {
        href: '/(staff)/operations/disbursements',
        match: '/operations/disbursements',
        label: 'Disbursements',
        icon: 'payments',
      },
      {
        href: '/(staff)/operations/repayments',
        match: '/operations/repayments',
        label: 'Repayments',
        icon: 'receipt-long',
      },
      { href: '/(staff)/clients', match: '/clients', label: 'Clients', icon: 'people' },
      aiStudioNavItem(),
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'dashboard' },
      applications: {
        title: 'Queue',
        icon: 'handshake',
        href: '/(staff)/operations/ops-queue',
      },
      clients: { title: 'Clients', icon: 'people' },
      loans: {
        title: 'Legacy',
        icon: 'menu-book',
        href: '/(staff)/loans?vintage=legacy',
      },
      repayments: {
        title: 'Repay',
        icon: 'receipt-long',
        href: '/(staff)/operations/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function operationsManagerNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Ops Manager',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'dashboard' },
      {
        href: '/(staff)/operations-manager/credit-queue',
        match: '/operations-manager/credit-queue',
        label: 'Credit queue',
        icon: 'assignment',
      },
      {
        href: '/(staff)/operations-manager/handoff',
        match: '/operations-manager/handoff',
        label: 'Repayment handoff',
        icon: 'handshake',
      },
      {
        href: '/(staff)/operations/repayments',
        match: '/operations/repayments',
        label: 'Repayments',
        icon: 'receipt-long',
      },
      {
        href: '/(staff)/operations-manager/escalated-repayments',
        match: '/operations-manager/escalated-repayments',
        label: 'Escalated repayments',
        icon: 'gavel',
      },
      {
        href: '/(staff)/operations-manager/executive',
        match: '/operations-manager/executive',
        label: 'Executive pipeline',
        icon: 'trending-up',
      },
      aiStudioNavItem(),
      {
        href: '/(staff)/loans?vintage=legacy',
        match: '/loans?vintage=legacy',
        label: 'Legacy Booking',
        icon: 'menu-book',
      },
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'dashboard' },
      applications: {
        title: 'Queue',
        icon: 'assignment',
        href: '/(staff)/operations-manager/credit-queue',
      },
      clients: HIDDEN_TAB,
      loans: {
        title: 'Legacy',
        icon: 'menu-book',
        href: '/(staff)/loans?vintage=legacy',
      },
      repayments: {
        title: 'Repay',
        icon: 'receipt-long',
        href: '/(staff)/operations/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function operationsAssistantNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Ops Assistant',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'dashboard' },
      {
        href: '/(staff)/operations-assistant/reviews',
        match: '/operations-assistant/reviews',
        label: 'Loan reviews',
        icon: 'fact-check',
      },
      {
        href: '/(staff)/loans?book=SME&vintage=legacy',
        match: '/loans?book=SME',
        label: 'SME legacy',
        icon: 'business',
      },
      {
        href: '/(staff)/loans?book=GROUP&vintage=legacy',
        match: '/loans?book=GROUP',
        label: 'Group legacy',
        icon: 'groups',
      },
      {
        href: '/(staff)/operations-assistant/repayments',
        match: '/operations-assistant/repayments',
        label: 'Repayments',
        icon: 'receipt-long',
      },
      aiStudioNavItem(),
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'dashboard' },
      applications: {
        title: 'Reviews',
        icon: 'fact-check',
        href: '/(staff)/operations-assistant/reviews',
      },
      clients: HIDDEN_TAB,
      loans: {
        title: 'Legacy',
        icon: 'menu-book',
        href: '/(staff)/loans?vintage=legacy',
      },
      repayments: {
        title: 'Ledger',
        icon: 'receipt-long',
        href: '/(staff)/operations-assistant/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function creditBookNavItems(): TabletNavItem[] {
  return [
    { href: '/(staff)/loans?book=SME', match: '/loans?book=SME', label: 'SME book', icon: 'business' },
    {
      href: '/(staff)/loans?book=GROUP',
      match: '/loans?book=GROUP',
      label: 'Group book',
      icon: 'groups',
    },
  ];
}

function investmentNavItems(): TabletNavItem[] {
  return [
    {
      href: '/(staff)/investments',
      match: '/investments',
      label: 'Investment Overview',
      icon: 'account-balance',
    },
    {
      href: '/(staff)/investments/funds',
      match: '/investments/funds',
      label: 'Investment Funds',
      icon: 'account-balance-wallet',
    },
    {
      href: '/(staff)/investments/shareholders',
      match: '/investments/shareholders',
      label: 'Shareholders',
      icon: 'supervisor-account',
    },
    {
      href: '/(staff)/investments/subscriptions',
      match: '/investments/subscriptions',
      label: 'Investments',
      icon: 'attach-money',
    },
    {
      href: '/(staff)/investments/allocations',
      match: '/investments/allocations',
      label: 'Capital allocation',
      icon: 'pie-chart',
    },
  ];
}

function ceoNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'CEO',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'dashboard' },
      ...creditBookNavItems(),
      { href: '/(staff)/par', match: '/par', label: 'PAR & analytics', icon: 'warning' },
      {
        href: '/(staff)/ceo/queue',
        match: '/ceo/queue',
        label: 'Executive approvals',
        icon: 'assignment-turned-in',
      },
      {
        href: '/(staff)/ceo/gceo-escalations',
        match: '/ceo/gceo-escalations',
        label: 'GCEO escalations',
        icon: 'trending-up',
      },
      {
        href: '/(staff)/ceo/pending-release',
        match: '/ceo/pending-release',
        label: 'Pending release',
        icon: 'lock-open',
      },
      {
        href: '/(staff)/ceo/repayments',
        match: '/ceo/repayments',
        label: 'Repayment Oversight',
        icon: 'receipt-long',
      },
      { href: '/(staff)/clients', match: '/clients', label: 'Clients', icon: 'people' },
      ...investmentNavItems(),
      aiStudioNavItem(),
      { href: '/(staff)/reports', match: '/reports', label: 'Reports', icon: 'assessment' },
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'dashboard' },
      applications: {
        title: 'Queue',
        icon: 'assignment-turned-in',
        href: '/(staff)/ceo/queue',
      },
      clients: { title: 'Clients', icon: 'people' },
      loans: { title: 'Books', icon: 'account-balance' },
      repayments: {
        title: 'Oversight',
        icon: 'receipt-long',
        href: '/(staff)/ceo/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function gceoNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'GCEO',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'dashboard' },
      ...creditBookNavItems(),
      { href: '/(staff)/par', match: '/par', label: 'PAR & analytics', icon: 'warning' },
      {
        href: '/(staff)/gceo/queue',
        match: '/gceo/queue',
        label: 'Final approvals',
        icon: 'assignment-turned-in',
      },
      {
        href: '/(staff)/gceo/ceo-pipeline',
        match: '/gceo/ceo-pipeline',
        label: 'CEO pipeline',
        icon: 'visibility',
      },
      {
        href: '/(staff)/gceo/pending-release',
        match: '/gceo/pending-release',
        label: 'Pending release',
        icon: 'lock-open',
      },
      {
        href: '/(staff)/gceo/repayments',
        match: '/gceo/repayments',
        label: 'Repayment Strategy',
        icon: 'receipt-long',
      },
      { href: '/(staff)/clients', match: '/clients', label: 'Clients', icon: 'people' },
      ...investmentNavItems(),
      aiStudioNavItem(),
      { href: '/(staff)/reports', match: '/reports', label: 'Reports', icon: 'assessment' },
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'dashboard' },
      applications: {
        title: 'Queue',
        icon: 'assignment-turned-in',
        href: '/(staff)/gceo/queue',
      },
      clients: { title: 'Clients', icon: 'people' },
      loans: { title: 'Books', icon: 'account-balance' },
      repayments: {
        title: 'Strategy',
        icon: 'receipt-long',
        href: '/(staff)/gceo/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function portfolioManagerNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Portfolio',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'dashboard' },
      { href: '/(staff)/loans?book=SME', match: '/loans?book=SME', label: 'SME book', icon: 'business' },
      {
        href: '/(staff)/loans?book=GROUP',
        match: '/loans?book=GROUP',
        label: 'Group book',
        icon: 'groups',
      },
      {
        href: '/(staff)/portfolio-manager/approvals',
        match: '/portfolio-manager/approvals',
        label: 'Approvals',
        icon: 'assignment-turned-in',
      },
      {
        href: '/(staff)/portfolio-manager/drawdowns',
        match: '/portfolio-manager/drawdowns',
        label: 'Loan drawdowns',
        icon: 'layers',
      },
      {
        href: '/(staff)/portfolio-manager/zones',
        match: '/portfolio-manager/zones',
        label: 'Zones & districts',
        icon: 'map',
      },
      { href: '/(staff)/clients', match: '/clients', label: 'Clients', icon: 'people' },
      {
        href: '/(staff)/portfolio-manager/repayments',
        match: '/portfolio-manager/repayments',
        label: 'Portfolio ledger',
        icon: 'receipt-long',
      },
      aiStudioNavItem(),
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'dashboard' },
      applications: {
        title: 'Approvals',
        icon: 'assignment-turned-in',
        href: '/(staff)/portfolio-manager/approvals',
      },
      clients: { title: 'Clients', icon: 'people' },
      loans: { title: 'Books', icon: 'account-balance' },
      repayments: {
        title: 'Ledger',
        icon: 'receipt-long',
        href: '/(staff)/portfolio-manager/repayments',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

function auditorNav(unreadCount: number): StaffRoleNav {
  return {
    title: 'Auditor',
    sidebar: [
      { href: '/(staff)', match: '/', label: 'Dashboard', icon: 'policy' },
      { href: '/(staff)/audit/findings', match: '/audit/findings', label: 'Findings', icon: 'gavel' },
      { href: '/(staff)/audit/trail', match: '/audit/trail', label: 'Trail', icon: 'history' },
      { href: '/(staff)/audit/risk', match: '/audit/risk', label: 'Risk', icon: 'security' },
      {
        href: '/(staff)/audit/loan-performance',
        match: '/audit/loan-performance',
        label: 'Loan book',
        icon: 'account-balance',
      },
      { href: '/(staff)/audit/statistics', match: '/audit/statistics', label: 'Statistics', icon: 'pie-chart' },
      { href: '/(staff)/audit/clients', match: '/audit/clients', label: 'Clients', icon: 'people' },
      aiStudioNavItem(),
      ...alertsAndProfile(unreadCount),
    ],
    tabs: {
      index: { title: 'Home', icon: 'policy' },
      applications: {
        title: 'Findings',
        icon: 'gavel',
        href: '/(staff)/audit/findings',
      },
      clients: {
        title: 'Clients',
        icon: 'people',
        href: '/(staff)/audit/clients',
      },
      loans: {
        title: 'Book',
        icon: 'account-balance',
        href: '/(staff)/audit/loan-performance',
      },
      repayments: {
        title: 'Risk',
        icon: 'security',
        href: '/(staff)/audit/risk',
      },
      notifications: { title: 'Alerts', icon: 'notifications' },
      profile: { title: 'Profile', icon: 'person' },
    },
  };
}

export function staffRoleNav(role?: string | null, unreadCount = 0): StaffRoleNav {
  if (isInternalAuditorStaffRole(role)) return auditorNav(unreadCount);
  if (isAccountantStaffRole(role)) return accountantNav(unreadCount);
  if (isOperationsManagerStaffRole(role)) return operationsManagerNav(unreadCount);
  if (isOperationsAssistantStaffRole(role)) return operationsAssistantNav(unreadCount);
  if (isOperationsOfficerStaffRole(role)) return operationsOfficerNav(unreadCount);
  if (isPortfolioManagerStaffRole(role)) return portfolioManagerNav(unreadCount);
  if (isGceoStaffRole(role)) return gceoNav(unreadCount);
  if (isCeoStaffRole(role)) return ceoNav(unreadCount);
  return loanOfficerNav(unreadCount);
}

export function staffTabHref(tab: StaffTabOptions): string | null | undefined {
  return tab.href;
}
