/**
 * Test data for loans, applications, repayments.
 * Replace with API fetches when backend is connected.
 */

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface LoanApplication {
  id: number;
  /** Server id when local offline id differs. */
  remote_id?: number | null;
  application_number: string;
  status: string;
  requested_amount: number;
  approved_amount?: number;
  requested_term_months: number;
  product_name: string;
  loan_product_id?: number;
  application_date: string;
  client_id?: string;
  client_name?: string;
  purpose?: string;
  assigned_staff_name?: string;
  assigned_cio_id?: number | null;
  assigned_cio_name?: string | null;
  sync_status?: SyncStatus;
  group_loan_allocation?: Record<string, unknown>;
  origination_stage?: string | null;
  origination_return_reason?: string | null;
  application_notes?: string;
  loan_type?: string;
  selected_repayment_strategy?: string;
  is_group_application?: boolean;
  my_share_requested_amount_minor?: number | null;
  group_requested_amount_minor?: number | null;
}

export interface Loan {
  id: number;
  loan_account_number: string;
  client_name: string;
  client_id?: number; // For API: required when recording repayments
  product_name: string;
  loan_product_id?: number;
  principal_amount: number;
  outstanding_principal: number;
  total_repaid: number;
  status: string;
  next_due_date?: string;
  days_in_arrears: number;
  interest_rate: number;
  term_months: number;
  days_until_next_repayment?: number | null;
  repayment_tracking_live?: boolean;
  application_origination_stage?: string | null;
  is_group_facility?: boolean;
  my_share_principal_minor?: number | null;
  group_principal_minor?: number | null;
  my_share_outstanding_minor?: number | null;
  allocation_id?: number | null;
  funding_fund_name?: string | null;
  investment_assigned?: boolean | null;
  is_legacy?: boolean;
  legacy_booking_status?: string | null;
  /** Source application ID for reallocation (group loans). */
  loan_application_id?: number | null;
}

export interface ScheduleEntry {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  remainingBalance: number;
  status: 'pending' | 'paid';
}

export interface Repayment {
  id: number;
  loan_id?: number;
  loan_account_number: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  repayment_date: string;
  status: string;
  internal_status?: string;
  lifecycle_state?: string;
  payment_method?: string;
  deposit_receipt_number?: string | null;
  reference_number?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  repayment_schema_version?: string;
  member_contributions?: Array<{ member_client_id: number; amount: number }>;
  member_contribution_details?: Array<{
    member_client_id: number;
    amount: number;
    member_full_name?: string | null;
  }>;
  sync_status?: SyncStatus;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'repayment' | 'application' | 'alert' | 'broadcast';
  created_at: string;
  read: boolean;
}

export const TEST_APPLICATIONS: LoanApplication[] = [
  {
    id: 1,
    application_number: 'APP-2024-001',
    status: 'APPROVED',
    requested_amount: 500000,
    approved_amount: 500000,
    requested_term_months: 12,
    product_name: 'Personal Loan',
    application_date: '2024-01-15',
    client_name: 'John Mwale',
  },
  {
    id: 2,
    application_number: 'APP-2024-002',
    status: 'PENDING',
    requested_amount: 1000000,
    requested_term_months: 24,
    product_name: 'Business Loan',
    application_date: '2024-02-01',
    client_name: 'Mary Banda',
  },
  {
    id: 3,
    application_number: 'APP-2024-003',
    status: 'SUBMITTED',
    requested_amount: 250000,
    requested_term_months: 6,
    product_name: 'Agric Loan',
    application_date: '2024-02-10',
  },
];

export const TEST_LOANS: Loan[] = [
  {
    id: 1,
    loan_account_number: 'LN-2024-001',
    client_name: 'John Mwale',
    product_name: 'Personal Loan',
    principal_amount: 500000,
    outstanding_principal: 350000,
    total_repaid: 150000,
    status: 'DISBURSED',
    next_due_date: '2024-03-15',
    days_in_arrears: 0,
    interest_rate: 1200,
    term_months: 12,
  },
  {
    id: 2,
    loan_account_number: 'LN-2024-002',
    client_name: 'Mary Banda',
    product_name: 'Business Loan',
    principal_amount: 1000000,
    outstanding_principal: 950000,
    total_repaid: 50000,
    status: 'DISBURSED',
    next_due_date: '2024-02-28',
    days_in_arrears: 2,
    interest_rate: 1500,
    term_months: 24,
  },
];

export const TEST_REPAYMENTS: Repayment[] = [
  {
    id: 1,
    loan_account_number: 'LN-2024-001',
    amount: 45000,
    principal_amount: 40000,
    interest_amount: 5000,
    repayment_date: '2024-01-15',
    status: 'COMPLETED',
  },
  {
    id: 2,
    loan_account_number: 'LN-2024-001',
    amount: 45000,
    principal_amount: 42000,
    interest_amount: 3000,
    repayment_date: '2024-02-15',
    status: 'COMPLETED',
  },
  {
    id: 3,
    loan_account_number: 'LN-2024-002',
    amount: 50000,
    principal_amount: 45000,
    interest_amount: 5000,
    repayment_date: '2024-01-28',
    status: 'COMPLETED',
  },
];

export const TEST_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    title: 'Repayment Due',
    message: 'Loan LN-2024-002 has a payment due in 3 days. Amount: MK 50,000',
    type: 'repayment',
    created_at: '2024-02-25T09:00:00',
    read: false,
  },
  {
    id: 2,
    title: 'New Application',
    message: 'Mary Banda submitted a new loan application (APP-2024-002)',
    type: 'application',
    created_at: '2024-02-24T14:30:00',
    read: true,
  },
  {
    id: 3,
    title: 'Overdue Alert',
    message: '2 loans are overdue. Total arrears: MK 100,000',
    type: 'alert',
    created_at: '2024-02-23T08:00:00',
    read: false,
  },
];
