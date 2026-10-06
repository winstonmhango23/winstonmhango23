/**
 * Client-facing loan request wizard — delegates to unified origination flow.
 */

import React from 'react';

import { LoanOriginationWizard } from '@/components/loan-origination/loan-origination-wizard';
import type { LoanApplication } from '@/store';
import type { SubmitApplicationInput } from '@/store/applications';

interface LoanApplicationModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: SubmitApplicationInput) => Promise<LoanApplication | null>;
  submitting: boolean;
}

export function LoanApplicationModal({ visible, onClose, onSubmit, submitting }: LoanApplicationModalProps) {
  return (
    <LoanOriginationWizard
      mode="client"
      visible={visible}
      onClose={onClose}
      submitting={submitting}
      onSubmitClient={onSubmit}
      onSubmitStaff={async () => null}
    />
  );
}
