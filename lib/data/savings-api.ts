import { api } from '@/lib/api-client';
import { config } from '@/lib/config';

export type ApiStaffSavingsAccount = {
  id: number;
  client_id: number;
  client_name?: string;
  account_number: string;
  account_type: string;
  account_category?: string | null;
  balance: number;
  currency: string;
  status: string;
  auto_generated: boolean;
  effective_balance?: number | null;
  pending_deposit_amount?: number | null;
  pending_deposit_count?: number | null;
  pending_repayment_amount?: number | null;
};

export type ApiStaffSavingsDeposit = {
  id: number;
  deposit_number: string;
  account_id: number;
  client_id: number;
  client_name?: string;
  amount_minor: number;
  currency: string;
  deposit_method: string;
  status: string;
  created_at: string;
  created_by_name?: string;
  reference_number?: string | null;
  notes?: string | null;
};

export type ApiStaffSavingsWithdrawal = {
  id: number;
  withdrawal_number: string;
  account_id: number;
  client_id: number;
  client_name?: string;
  amount_minor: number;
  currency: string;
  withdrawal_method: string;
  status: string;
  created_at: string;
  created_by_name?: string;
};

export type ApiStaffInternalTransfer = {
  id: number;
  transfer_number: string;
  client_id: number;
  source_account_id: number;
  destination_account_id: number;
  amount_minor: number;
  currency: string;
  transfer_purpose?: string | null;
  loan_id?: number | null;
  status: string;
  created_at: string;
  notes?: string | null;
};

/** @deprecated No backend /staff/savings/accounts — use per-client accounts. */
export async function apiGetStaffSavingsAccounts(_token: string): Promise<ApiStaffSavingsAccount[]> {
  return [];
}

/** @deprecated No backend list-all deposits endpoint matching this path. */
export async function apiGetStaffSavingsDeposits(
  _token: string,
  _limit?: number
): Promise<ApiStaffSavingsDeposit[]> {
  return [];
}

/** @deprecated No backend list-all withdrawals endpoint matching this path. */
export async function apiGetStaffSavingsWithdrawals(
  _token: string,
  _limit?: number
): Promise<ApiStaffSavingsWithdrawal[]> {
  return [];
}

export async function apiGetClientAccounts(token: string, clientId: number): Promise<ApiStaffSavingsAccount[]> {
  const res = await api.get<ApiStaffSavingsAccount[]>(config.staffClientAccounts.list(clientId), token);
  return Array.isArray(res) ? res : [];
}

export type ApiCreateMissingAccountsResult = {
  client_id?: number;
  created_count?: number;
  created_accounts?: unknown[];
  created?: unknown[];
  errors?: string[];
  success?: boolean;
  message?: string;
};

export async function apiCreateMissingClientAccounts(
  token: string,
  clientId: number
): Promise<ApiCreateMissingAccountsResult> {
  const res = await api.post<ApiCreateMissingAccountsResult>(
    config.staffClientAccounts.createMissing(clientId),
    {},
    token
  );
  return res ?? {};
}

export async function apiGetStaffClientDeposits(
  token: string,
  clientId: number
): Promise<ApiStaffSavingsDeposit[]> {
  const res = await api.get<ApiStaffSavingsDeposit[]>(
    config.staffSavings.depositsByClient(clientId),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiGetStaffClientWithdrawals(
  token: string,
  clientId: number
): Promise<ApiStaffSavingsWithdrawal[]> {
  const res = await api.get<ApiStaffSavingsWithdrawal[]>(
    config.staffSavings.withdrawalsByClient(clientId),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiGetStaffClientTransfers(
  token: string,
  clientId: number
): Promise<ApiStaffInternalTransfer[]> {
  const res = await api.get<ApiStaffInternalTransfer[]>(
    config.staffSavings.transfersByClient(clientId),
    token
  );
  return Array.isArray(res) ? res : [];
}

export async function apiCreateAndSubmitStaffDeposit(
  token: string,
  data: {
    account_id: number;
    client_id: number;
    amount_minor: number;
    deposit_method?: string;
    reference_number?: string;
    notes?: string;
    receipt_path?: string;
    receipt_metadata?: Record<string, unknown>;
  }
): Promise<ApiStaffSavingsDeposit> {
  const created = await api.post<ApiStaffSavingsDeposit>(config.staffSavings.deposits, {
    client_id: data.client_id,
    account_id: data.account_id,
    amount_minor: data.amount_minor,
    deposit_method: data.deposit_method ?? 'CASH',
    reference_number: data.reference_number,
    notes: data.notes,
    receipt_path: data.receipt_path,
    receipt_metadata: data.receipt_metadata,
    created_by_client: false,
  }, token);
  return api.post<ApiStaffSavingsDeposit>(config.staffSavings.depositSubmit(created.id), {}, token);
}

/** @deprecated Prefer apiCreateAndSubmitStaffDeposit */
export async function apiCreateStaffDeposit(
  token: string,
  data: {
    account_id: number;
    client_id: number;
    amount_minor: number;
    deposit_method?: string;
    notes?: string;
    reference_number?: string;
    receipt_path?: string;
    receipt_metadata?: Record<string, unknown>;
  }
): Promise<ApiStaffSavingsDeposit | null> {
  return apiCreateAndSubmitStaffDeposit(token, data);
}

export async function apiCreateAndSubmitStaffWithdrawal(
  token: string,
  data: {
    account_id: number;
    client_id: number;
    amount_minor: number;
    withdrawal_method?: string;
    notes?: string;
    reference_number?: string;
  }
): Promise<ApiStaffSavingsWithdrawal> {
  const created = await api.post<ApiStaffSavingsWithdrawal>(config.staffSavings.withdrawals, {
    client_id: data.client_id,
    account_id: data.account_id,
    amount_minor: data.amount_minor,
    withdrawal_method: data.withdrawal_method ?? 'CASH',
    notes: data.notes,
    reference_number: data.reference_number,
    created_by_client: false,
  }, token);
  return api.post<ApiStaffSavingsWithdrawal>(
    config.staffSavings.withdrawalSubmit(created.id),
    {},
    token
  );
}

/** @deprecated Prefer apiCreateAndSubmitStaffWithdrawal */
export async function apiCreateStaffWithdrawal(
  token: string,
  data: {
    account_id: number;
    client_id: number;
    amount_minor: number;
    withdrawal_method?: string;
    notes?: string;
  }
): Promise<ApiStaffSavingsWithdrawal | null> {
  return apiCreateAndSubmitStaffWithdrawal(token, data);
}

export async function apiCreateAndSubmitStaffTransfer(
  token: string,
  data: {
    client_id: number;
    source_account_id: number;
    destination_account_id: number;
    amount_minor: number;
    transfer_purpose?: string;
    loan_id?: number;
    notes?: string;
  }
): Promise<ApiStaffInternalTransfer> {
  const created = await api.post<ApiStaffInternalTransfer>(config.staffSavings.transfers, {
    client_id: data.client_id,
    source_account_id: data.source_account_id,
    destination_account_id: data.destination_account_id,
    amount_minor: data.amount_minor,
    transfer_purpose: data.transfer_purpose ?? 'GENERAL',
    loan_id: data.loan_id,
    notes: data.notes,
    created_by_client: false,
  }, token);
  return api.post<ApiStaffInternalTransfer>(
    config.staffSavings.transferSubmit(created.id),
    {},
    token
  );
}

export type ApiStaffClientCashCollateralBalance = {
  total_balance: number;
  locked_balance: number;
  available_balance: number;
  account_id?: number | null;
  account_number?: string | null;
};

export type ApiStaffClientCashCollateralFundResult = {
  transfer_id?: number | null;
  transfer_number?: string | null;
  status?: string | null;
  amount_minor: number;
  destination_account_id: number;
  destination_account_number: string;
  message: string;
};

export async function apiGetStaffClientCashCollateralBalance(
  token: string,
  clientId: number
): Promise<ApiStaffClientCashCollateralBalance> {
  return api.get<ApiStaffClientCashCollateralBalance>(
    config.staffCashCollateral.balance(clientId),
    token
  );
}

export async function apiFundStaffClientCashCollateral(
  token: string,
  data: {
    client_id: number;
    source_account_id: number;
    amount_minor: number;
    chairperson_id?: number;
  }
): Promise<ApiStaffClientCashCollateralFundResult> {
  return api.post<ApiStaffClientCashCollateralFundResult>(
    config.staffCashCollateral.fund,
    {
      client_id: data.client_id,
      source_account_id: data.source_account_id,
      amount_minor: data.amount_minor,
      chairperson_id: data.chairperson_id,
      created_by_client: false,
    },
    token
  );
}
