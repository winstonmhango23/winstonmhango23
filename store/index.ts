/**
 * Zustand stores – central export.
 * All data from API when USE_API; SQLite when EXPO_PUBLIC_USE_API=false.
 */

export { useAccountsStore } from './accounts';
export { useApplicationsStore } from './applications';
export { useAuthStore } from './auth';
export { useClientNotificationsStore } from './client-notifications';
export { useClientsStore } from './clients';
export { useLoansStore } from './loans';
export { useNotificationsStore } from './notifications';
export { useProfileStore } from './profile';
export { useRepaymentsStore } from './repayments';
export { useSurveyStore } from './survey';
export { useHomeBootstrapStore } from './home-bootstrap';
export type { Loan, LoanApplication, Notification, Repayment } from './test-data';

