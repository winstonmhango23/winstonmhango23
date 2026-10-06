/**
 * Staff loan officer wizard — delegates to unified origination flow.
 */

import React from 'react';

import { LoanOriginationWizard } from '@/components/loan-origination/loan-origination-wizard';
import type { LoanApplication } from '@/store';
import type { SubmitApplicationInput } from '@/store/applications';

interface StaffLoanApplicationModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (clientId: string, clientName: string, input: SubmitApplicationInput) => Promise<LoanApplication | null>;
  submitting: boolean;
}

export function StaffLoanApplicationModal({
  visible,
  onClose,
  onSubmit,
  submitting,
}: StaffLoanApplicationModalProps) {
  return (
    <LoanOriginationWizard
      mode="staff"
      visible={visible}
      onClose={onClose}
      submitting={submitting}
      onSubmitClient={async () => null}
      onSubmitStaff={onSubmit}
    />
  );
}
