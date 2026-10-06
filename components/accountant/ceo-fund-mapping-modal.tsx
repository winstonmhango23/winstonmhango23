import {
  InvestmentAssignmentModal,
  type InvestmentAssignmentResult,
} from '@/components/investment/investment-assignment-modal';

/** Backward-compatible alias for the shared investment assignment modal. */
export function CeoFundMappingModal({
  visible,
  loanId,
  accountNumber,
  clientName,
  onClose,
  onMapped,
}: {
  visible: boolean;
  loanId: number;
  accountNumber: string;
  clientName: string;
  onClose: () => void;
  onMapped?: (allocationId: number, fundName?: string | null) => void;
}) {
  return (
    <InvestmentAssignmentModal
      target={visible ? { loanId, accountNumber, clientName } : null}
      open={visible}
      onClose={onClose}
      onAssigned={(result: InvestmentAssignmentResult) => {
        const allocationId = result.allocation_id;
        if (allocationId == null) return;
        onMapped?.(
          allocationId,
          result.funding_fund_name ?? result.fundingFundName ?? null
        );
      }}
    />
  );
}
