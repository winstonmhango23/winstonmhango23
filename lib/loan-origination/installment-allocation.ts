/**
 * Multi-installment allocation plan for borrower repayments (portal parity).
 */

export type InstallmentAllocationRow = {
  id: number;
  remaining_principal?: number;
  remaining_interest?: number;
  penalty_amount?: number;
  remaining_amount?: number;
  total_amount?: number;
};

export type InstallmentAllocationPlan = {
  principal: number;
  interest: number;
  penalty: number;
  total: number;
};

export function buildInstallmentAllocationPlan(
  rows: InstallmentAllocationRow[],
  selectedIds: Iterable<number>
): InstallmentAllocationPlan {
  const selected = new Set(selectedIds);
  return rows
    .filter((r) => selected.has(r.id))
    .reduce(
      (acc, inst) => ({
        principal: acc.principal + Number(inst.remaining_principal ?? 0),
        interest: acc.interest + Number(inst.remaining_interest ?? 0),
        penalty: acc.penalty + Number(inst.penalty_amount ?? 0),
        total: acc.total + Number(inst.remaining_amount ?? inst.total_amount ?? 0),
      }),
      { principal: 0, interest: 0, penalty: 0, total: 0 }
    );
}
