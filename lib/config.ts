/**
 * App configuration – API base URL and feature flags.
 * Use EXPO_PUBLIC_API_URL in .env for overrides.
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'https://cofi-bms-api-production.up.railway.app/api/v1';

export const config = {
  apiBase: API_BASE,
  clientAuth: {
    login: `${API_BASE}/client/client-auth/token`,
    refresh: `${API_BASE}/client/client-auth/refresh`,
    register: `${API_BASE}/client/client-auth/register`,
    registerIndividual: `${API_BASE}/client/client-auth/register-portal/individual`,
    registerGroup: `${API_BASE}/client/client-auth/register-portal/group`,
    publicRegistrationBranches: `${API_BASE}/client/client-auth/public-registration-branches`,
    publicRegistrationDistricts: `${API_BASE}/client/client-auth/public-registration-districts`,
    requestPasswordReset: `${API_BASE}/client/client-auth/request-password-reset`,
    resetPassword: `${API_BASE}/client/client-auth/reset-password`,
  },
  staffAuth: {
    login: `${API_BASE}/auth/token`,
    refresh: `${API_BASE}/auth/refresh`,
    me: `${API_BASE}/auth/me`,
    changePassword: `${API_BASE}/auth/change-password`,
  },
  loans: {
    myApplications: `${API_BASE}/loans/my-applications`,
    applications: `${API_BASE}/loans/applications`,
    apply: `${API_BASE}/loans/apply`,
    myLoans: `${API_BASE}/loans/my-loans`,
    byClient: (clientId: number) => `${API_BASE}/loans/client/${clientId}/loans`,
    investmentPools: `${API_BASE}/loans/investment-pools`,
    assignInvestmentPool: (loanId: number) => `${API_BASE}/loans/${loanId}/assign-investment-pool`,
    loanAssignmentOfficers: `${API_BASE}/loans/assignments/loan-officers`,
    legacyUnassignedAssignments: `${API_BASE}/loans/assignments/legacy/unassigned`,
    legacyAssignedAssignments: (officerId: number) =>
      `${API_BASE}/loans/assignments/legacy/assigned?officer_id=${officerId}`,
    assignLegacyLoanOfficer: (loanId: number) => `${API_BASE}/loans/${loanId}/assign-officer`,
    reallocateGroupAllocation: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/group-allocation/reallocation`,
    schedulePreview: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/schedule-preview`,
  },
  repayments: {
    dueToday: `${API_BASE}/repayments/due-today`,
    overdue: `${API_BASE}/repayments/overdue`,
    upcoming: `${API_BASE}/repayments/upcoming`,
    legacyBook: `${API_BASE}/repayments/legacy-book`,
    portfolioHistory: `${API_BASE}/repayments/portfolio-history`,
    reverse: (id: number) => `${API_BASE}/repayments/${id}/reverse`,
  },
  permissions: {
    me: `${API_BASE}/permissions/me`,
  },
  staff: {
    digest: `${API_BASE}/staff/digest`,
    digestPreferences: `${API_BASE}/staff/digest-preferences`,
    notifications: `${API_BASE}/staff/notifications`,
    notificationsUnreadCount: `${API_BASE}/staff/notifications/unread-count`,
    loanOfficerDashboard: `${API_BASE}/staff/loan-officer/dashboard`,
    cioDashboard: `${API_BASE}/staff/cio/dashboard`,
    cioLoanOfficers: `${API_BASE}/staff/cio/loan-officers`,
    cioSupervisedLoansV2: `${API_BASE}/staff/cio/supervised-loans/v2`,
    cioSupervisedPortfolioAnalytics: `${API_BASE}/staff/cio/supervised-portfolio-analytics`,
    creditBookCounts: `${API_BASE}/loans/credit-book-counts`,
    portfolioManagerDashboard: `${API_BASE}/portfolio-manager/dashboard`,
    portfolioManagerPmQueue: `${API_BASE}/portfolio-manager/applications/pm-queue`,
    portfolioManagerCioBacklog: `${API_BASE}/portfolio-manager/applications/cio-backlog`,
    portfolioManagerExecutivePipeline: `${API_BASE}/portfolio-manager/applications/executive-pipeline`,
    portfolioManagerHandoffQueue: `${API_BASE}/portfolio-manager/applications/repayment-handoff-queue`,
    portfolioManagerDrawdownPipeline: `${API_BASE}/portfolio-manager/applications/drawdown-pipeline-summary`,
    portfolioManagerLoanDrawdowns: (applicationId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns`,
    portfolioManagerLoanDrawdown: (applicationId: number, drawdownId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns/${drawdownId}`,
    portfolioManagerLoanDrawdownApprove: (applicationId: number, drawdownId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns/${drawdownId}/approve`,
    portfolioManagerRefreshDrawdownBeneficiary: (applicationId: number, drawdownId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns/${drawdownId}/refresh-beneficiary-from-kyc`,
    portfolioManagerKycBeneficiary: (applicationId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/kyc-beneficiary`,
    portfolioManagerDrawdownAttest: (drawdownId: number) =>
      `${API_BASE}/portfolio-manager/loan-drawdowns/${drawdownId}/verification-attestation`,
    portfolioManagerFundingPools: `${API_BASE}/portfolio-manager/funding-pools`,
    portfolioManagerDrawdownHistory: `${API_BASE}/portfolio-manager/applications/drawdown-history`,
    portfolioManagerDrawdownSettings: `${API_BASE}/portfolio-manager/drawdown-settings`,
    portfolioManagerDrawdownSettingsLogo: `${API_BASE}/portfolio-manager/drawdown-settings/logo`,
    portfolioManagerLoanDrawdownCancel: (applicationId: number, drawdownId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns/${drawdownId}/cancel`,
    portfolioManagerLoanDrawdownContractPdf: (applicationId: number, drawdownId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns/${drawdownId}/request-contract-pdf`,
    portfolioManagerLoanDrawdownContractPdfStatus: (applicationId: number, drawdownId: number) =>
      `${API_BASE}/portfolio-manager/applications/${applicationId}/loan-drawdowns/${drawdownId}/contract-pdf-status`,
    accountantDashboard: `${API_BASE}/accountant/dashboard`,
    accountantPendingDisbursement: `${API_BASE}/accountant/applications/pending-disbursement`,
    accountantOperationsQueue: `${API_BASE}/accountant/applications/operations-queue`,
    accountantRecentDisbursements: `${API_BASE}/accountant/disbursements/recent`,
    accountantLegacyBooking: `${API_BASE}/accountant/legacy-booking`,
    accountantLoanJournals: `${API_BASE}/accountant/loan-journals`,
    accountantGenerateJournals: (loanId: number) =>
      `${API_BASE}/accountant/loan-journals/${loanId}/generate`,
    accountantReturnLoanForCorrection: (loanId: number) =>
      `${API_BASE}/accountant/loan-journals/${loanId}/return-for-correction`,
    accountantPendingRepayments: `${API_BASE}/accountant/repayments/pending`,
    accountantFinalizeRepayments: `${API_BASE}/accountant/repayments/finalize`,
    accountantFinalizeAllRepayments: `${API_BASE}/accountant/repayments/finalize-all`,
    accountantFundingPools: `${API_BASE}/accountant/funding-pools`,
    accountantAttachLoanFundingPool: (loanId: number) =>
      `${API_BASE}/accountant/loans/${loanId}/attach-funding-pool`,
    accountantAttachApplicationFundingPool: (applicationId: number) =>
      `${API_BASE}/accountant/applications/${applicationId}/attach-funding-pool`,
    portfolioManagerRepaymentsList: `${API_BASE}/portfolio-manager/repayments/list`,
    portfolioManagerRepaymentsMetrics: `${API_BASE}/portfolio-manager/repayments/metrics`,
    zones: `${API_BASE}/zones`,
    zone: (zoneId: number) => `${API_BASE}/zones/${zoneId}`,
    zoneHierarchy: (zoneId: number) => `${API_BASE}/zones/${zoneId}/hierarchy`,
    zoneAvailableLoanOfficers: (zoneId: number, includeTransferCandidates = false) =>
      `${API_BASE}/zones/${zoneId}/hierarchy/available-loan-officers${
        includeTransferCandidates ? '?include_transfer_candidates=true' : ''
      }`,
    zoneAssignLoanOfficer: (zoneId: number) =>
      `${API_BASE}/zones/${zoneId}/hierarchy/assign-loan-officer`,
    zoneAttachCreditOfficer: (zoneId: number) =>
      `${API_BASE}/zones/${zoneId}/hierarchy/attach-credit-officer`,
    members: `${API_BASE}/staff`,
    districts: `${API_BASE}/districts`,
    district: (districtId: number) => `${API_BASE}/districts/${districtId}`,
    regions: `${API_BASE}/regions`,
    operationsOfficerDashboard: `${API_BASE}/operations-officer/dashboard`,
    operationsOfficerOpsQueue: `${API_BASE}/operations-officer/origination/ops-queue`,
    operationsOfficerRecentRepayments: `${API_BASE}/operations-officer/repayments/recent`,
    operationsOfficerRepaymentSummary: `${API_BASE}/operations-officer/repayments/summary`,
    operationsOfficerEscalateRepayment: (id: number) =>
      `${API_BASE}/operations-officer/repayments/${id}/escalate`,
    operationsOfficerRepaymentRecord: (id: number) =>
      `${API_BASE}/operations-officer/repayments/${id}`,
    operationsOfficerConfirmBatch: `${API_BASE}/operations-officer/repayments/confirm-batch`,
    operationsOfficerQueueDetail: (id: number) =>
      `${API_BASE}/operations-officer/origination/${id}/queue-detail`,
    operationsOfficerProvisionCycle: (id: number) =>
      `${API_BASE}/operations-officer/origination/${id}/provision-repayment-cycle`,
    operationsOfficerStartLegacyTracking: (loanId: number) =>
      `${API_BASE}/operations-officer/legacy-booking/${loanId}/start-repayment-tracking`,
    operationsOfficerPreviousRepaymentsPreview: (loanId: number) =>
      `${API_BASE}/operations-officer/loans/${loanId}/previous-repayments/preview`,
    operationsOfficerPreviousRepayments: (loanId: number) =>
      `${API_BASE}/operations-officer/loans/${loanId}/previous-repayments`,
    operationsOfficerRecentDisbursements: `${API_BASE}/operations-officer/disbursements/recent`,
    operationsManagerDashboard: `${API_BASE}/operations-manager/dashboard`,
    operationsManagerOpsQueue: `${API_BASE}/operations-manager/applications/ops-queue`,
    operationsManagerHandoffQueue: `${API_BASE}/operations-manager/applications/repayment-handoff-queue`,
    operationsManagerExecutivePipeline: `${API_BASE}/operations-manager/applications/executive-pipeline`,
    operationsManagerEscalatedRepayments: `${API_BASE}/operations-manager/repayments/escalated`,
    operationsManagerApproveEscalation: (id: number) =>
      `${API_BASE}/operations-manager/repayments/${id}/approve-escalation`,
    operationsManagerApproveRepayment: (id: number) =>
      `${API_BASE}/operations-manager/repayments/${id}/approve`,
    operationsManagerRepaymentRecord: (id: number) =>
      `${API_BASE}/operations-manager/repayments/${id}`,
    operationsManagerQueueDetail: (id: number) =>
      `${API_BASE}/operations-manager/applications/${id}/queue-detail`,
    operationsAssistantPendingReview: `${API_BASE}/operations-assistant/disbursements/pending-review`,
    operationsAssistantReviewApprove: (id: number) =>
      `${API_BASE}/operations-assistant/disbursements/${id}/review-approve`,
    operationsAssistantReviewReturn: (id: number) =>
      `${API_BASE}/operations-assistant/disbursements/${id}/review-return`,
    operationsAssistantReviewDetail: (id: number) =>
      `${API_BASE}/operations-assistant/disbursements/${id}/review-detail`,
    loanBooking: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/create-loan`,
    originationStatus: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/origination-status`,
    originationTransition: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/origination/transition`,
    originationRecordMissingApproval: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/origination/record-missing-approval`,
    ceoReleaseApplication: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/ceo-release`,
    ceoClarificationReturn: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/ceo-clarification-return`,
    repaymentHandoffDetail: (applicationId: number) =>
      `${API_BASE}/operations-manager/applications/${applicationId}/repayment-handoff-detail`,
    ceoDashboard: `${API_BASE}/ceo/dashboard`,
    ceoQueue: `${API_BASE}/ceo/applications/ceo-queue`,
    ceoGceoEscalations: `${API_BASE}/ceo/applications/gceo-escalations`,
    ceoRepaymentsList: `${API_BASE}/ceo/repayments/list`,
    ceoExecutiveMetrics: `${API_BASE}/ceo/repayments/executive-metrics`,
    gceoDashboard: `${API_BASE}/gceo/dashboard`,
    gceoQueue: `${API_BASE}/gceo/applications/gceo-queue`,
    gceoCeoPipeline: `${API_BASE}/gceo/applications/ceo-pipeline`,
    gceoRepaymentsList: `${API_BASE}/gceo/repayments/list`,
    gceoStrategicMetrics: `${API_BASE}/gceo/repayments/strategic-metrics`,
    pendingDisbursementRelease: `${API_BASE}/loans/disbursements/pending-release`,
    approveDisbursementRelease: (id: number) =>
      `${API_BASE}/loans/disbursements/${id}/release-approve`,
    rejectDisbursementRelease: (id: number) =>
      `${API_BASE}/loans/disbursements/${id}/release-reject`,
    /** Authenticated stream for staff loan/application documents. */
    loanDocumentFile: (documentId: number) => `${API_BASE}/loans/documents/${documentId}/file`,
    clientDocumentFile: (clientId: number, documentId: number) =>
      `${API_BASE}/clients/${clientId}/documents/${documentId}/file`,
    applicationDocuments: (applicationId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/documents`,
    auditorDashboardMetrics: `${API_BASE}/auditor/dashboard/metrics`,
    auditorLoanPerformance: `${API_BASE}/auditor/loan-performance`,
    auditorAging: `${API_BASE}/auditor/loan-performance/aging`,
    auditorRiskAging: `${API_BASE}/auditor/risk/aging-clients`,
    auditorRiskLiquidity: `${API_BASE}/auditor/risk/liquidity`,
    auditorRiskNdti: `${API_BASE}/auditor/risk/ndti`,
    auditorRiskCrb: `${API_BASE}/auditor/risk/crb`,
    auditorRiskFia: `${API_BASE}/auditor/risk/fia`,
    auditorTrail: `${API_BASE}/auditor/audit-trail`,
    auditorFindings: `${API_BASE}/auditor/findings`,
    auditorFinding: (id: number) => `${API_BASE}/auditor/findings/${id}`,
    auditorStatistics: `${API_BASE}/auditor/statistics`,
    auditorClients: `${API_BASE}/auditor/clients`,
    auditorSystemOperations: `${API_BASE}/auditor/system-operations`,
    externalAuditorLogin: `${API_BASE}/external-auditor/auth/login`,
    externalAuditorDashboard: `${API_BASE}/external-auditor/dashboard/metrics`,
    externalAuditorLoanPerformance: `${API_BASE}/external-auditor/loan-performance`,
    externalAuditorAging: `${API_BASE}/external-auditor/loan-performance/aging`,
    externalAuditorRiskAging: `${API_BASE}/external-auditor/risk/aging-clients`,
    externalAuditorRiskLiquidity: `${API_BASE}/external-auditor/risk/liquidity`,
    externalAuditorClients: `${API_BASE}/external-auditor/clients`,
  },
  crbReports: {
    generate: `${API_BASE}/crb-reports/generate`,
    list: `${API_BASE}/crb-reports`,
    health: `${API_BASE}/crb-reports/health`,
    context: `${API_BASE}/crb-reports/context`,
    portfolioOfficers: `${API_BASE}/crb-reports/portfolio-officers`,
    cios: `${API_BASE}/crb-reports/cios`,
    managers: `${API_BASE}/crb-reports/managers`,
    detail: (id: number) => `${API_BASE}/crb-reports/${id}`,
    forward: (id: number) => `${API_BASE}/crb-reports/${id}/forward`,
    submitToManager: (id: number) => `${API_BASE}/crb-reports/${id}/submit-to-manager`,
    acknowledge: (id: number) => `${API_BASE}/crb-reports/${id}/acknowledge`,
    returnToOfficer: (id: number) => `${API_BASE}/crb-reports/${id}/return`,
  },
  staffReports: {
    catalog: `${API_BASE}/staff-reports/catalog`,
    forwardTargets: `${API_BASE}/staff-reports/forward-targets`,
    dashboard: `${API_BASE}/staff-reports/dashboard`,
    list: `${API_BASE}/staff-reports`,
    generate: `${API_BASE}/staff-reports/generate`,
    detail: (id: number) => `${API_BASE}/staff-reports/${id}`,
    forward: (id: number) => `${API_BASE}/staff-reports/${id}/forward`,
    acknowledge: (id: number) => `${API_BASE}/staff-reports/${id}/acknowledge`,
    returnReport: (id: number) => `${API_BASE}/staff-reports/${id}/return`,
    export: (id: number, format: string = 'JSON') =>
      `${API_BASE}/staff-reports/${id}/export?format=${encodeURIComponent(format)}`,
  },
  customer: {
    changePassword: `${API_BASE}/customer/change-password`,
    dashboard: `${API_BASE}/customer/dashboard`,
    profile: `${API_BASE}/customer/profile`,
    /** Profile / KYC supporting docs (base64 upload) — portal parity with /customer/documents. */
    documents: `${API_BASE}/customer/documents`,
    mediaUpload: `${API_BASE}/customer/media/upload`,
    loanApplications: `${API_BASE}/customer/loan-applications`,
    paymentSchedules: `${API_BASE}/customer/payment-schedules`,
    paymentSchedulesUpcoming: `${API_BASE}/customer/payment-schedules/upcoming`,
    repayments: `${API_BASE}/customer/repayments`,
    repaymentsDraft: `${API_BASE}/customer/repayments/draft`,
    pendingPayments: `${API_BASE}/customer/payments/pending`,
    installmentSelection: (loanId: number) =>
      `${API_BASE}/customer/loans/${loanId}/installment-selection`,
    repaymentLifecycle: (repaymentId: number) =>
      `${API_BASE}/customer/repayments/${repaymentId}/lifecycle-events`,
    settings: `${API_BASE}/customer/settings`,
    // Mark-read lives under /customer; /mobile/me/notifications is list/count only.
    notifications: `${API_BASE}/customer/notifications`,
    notificationsUnreadCount: `${API_BASE}/customer/notifications/unread-count`,
  },
  /** Borrower self-service Airtel Money repayment (client JWT → /customer/airtel/*). */
  airtel: {
    repay: `${API_BASE}/customer/airtel/repay`,
    repayStatus: (reference: string) =>
      `${API_BASE}/customer/airtel/repay/${encodeURIComponent(reference)}/status`,
    /** Staff collection initiate / status (staff JWT → /airtel/collections/*). */
    staffInitiate: `${API_BASE}/airtel/collections/initiate`,
    staffStatus: (reference: string) =>
      `${API_BASE}/airtel/collections/${encodeURIComponent(reference)}`,
  },
  /**
   * Borrower TNM Mpamba (client JWT → /customer/tnm/*).
   * Staff collections use /tnm/collections/* (see staffInitiate / staffStatus).
   */
  mpamba: {
    repay: `${API_BASE}/customer/tnm/repay`,
    repayStatus: (reference: string) =>
      `${API_BASE}/customer/tnm/repay/${encodeURIComponent(reference)}/status`,
    staffInitiate: `${API_BASE}/tnm/collections/initiate`,
    staffStatus: (reference: string) =>
      `${API_BASE}/tnm/collections/${encodeURIComponent(reference)}`,
  },
  survey: {
    pending: `${API_BASE}/mobile/survey/pending`,
    respond: `${API_BASE}/mobile/survey/respond`,
    complete: `${API_BASE}/mobile/survey/complete`,
    batchRespond: `${API_BASE}/mobile/survey/batch-respond`,
    status: `${API_BASE}/mobile/survey/status`,
  },
  products: `${API_BASE}/loans/products`,
  device: {
    pushToken: `${API_BASE}/device/push-token`,
  },
  geolocations: {
    properties: `${API_BASE}/geolocations/properties`,
  },
  /** Borrower mobile session, KYC, loans, and group roster (client JWT → /mobile/*). */
  mobile: {
    session: `${API_BASE}/mobile/me/session`,
    kyc: `${API_BASE}/mobile/me/kyc`,
    kycUpload: `${API_BASE}/mobile/me/kyc/upload`,
    /** Default borrower/group-chair repayment create (pending ops verification). */
    repayments: `${API_BASE}/mobile/repayments`,
    loanRepaymentSchedule: (loanId: number) =>
      `${API_BASE}/mobile/me/loans/${loanId}/repayment-schedule`,
    groupMembers: `${API_BASE}/mobile/group/members`,
    groupMember: (memberId: number) => `${API_BASE}/mobile/group/members/${memberId}`,
    groupMemberLoans: (memberId: number) => `${API_BASE}/mobile/group/members/${memberId}/loans`,
    groupMemberCredentials: (memberId: number) =>
      `${API_BASE}/mobile/group/members/${memberId}/credentials`,
    proposedMemberClientId: `${API_BASE}/mobile/me/proposed-member-client-id`,
    proposedGroupClientId: `${API_BASE}/mobile/group/proposed-client-id`,
    groupLeaders: `${API_BASE}/mobile/group/leaders`,
    groupLeaderSlot: `${API_BASE}/mobile/group/leaders/slot`,
    groupLeaderCustom: `${API_BASE}/mobile/group/leaders/custom`,
    groupLeaderItem: (leaderId: number) => `${API_BASE}/mobile/group/leaders/${leaderId}`,
    applicationWorkflow: (applicationId: number) =>
      `${API_BASE}/mobile/applications/${applicationId}/workflow`,
    applicationOriginationReadiness: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/origination-readiness`,
    submitApplicationToLoanOfficer: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/submit-to-loan-officer`,
    withdrawApplication: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/withdraw`,
    returnBlockers: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/return-blockers`,
    applicationCollateral: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/collateral`,
    applicationCollateralSummary: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/collateral/summary`,
    applicationCollateralBatch: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/collateral/batch`,
    applicationCollateralItem: (applicationId: number, collateralId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/collateral/${collateralId}`,
    applicationGuarantors: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/guarantors`,
    applicationGuarantorItem: (applicationId: number, guarantorId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/guarantors/${guarantorId}`,
    applicationDocuments: (applicationId: number) =>
      `${API_BASE}/mobile/loan-applications/${applicationId}/documents`,
    loanDocumentFile: (documentId: number) =>
      `${API_BASE}/mobile/loan-documents/${documentId}/file`,
    customerDocumentFile: (documentId: number) =>
      `${API_BASE}/mobile/customer/documents/${documentId}/file`,
    guarantorCatalog: `${API_BASE}/mobile/me/guarantor-catalog`,
    guarantorCatalogAttach: (guarantorId: number, applicationId: number) =>
      `${API_BASE}/mobile/me/guarantor-catalog/${guarantorId}/attach-to-application/${applicationId}`,
    /** Staff discovery of guarantors already linked to a borrower/client. */
    staffClientGuarantors: `${API_BASE}/clients/guarantors`,
    staffGuarantorCatalog: `${API_BASE}/staff/guarantor-catalog`,
    loansGuarantorProfiles: `${API_BASE}/loans/guarantors/profiles`,
    loansGuarantorCatalog: `${API_BASE}/loans/guarantor-catalog`,
    collateralVault: `${API_BASE}/mobile/me/collateral-vault`,
    collateralVaultLocation: (collateralId: number) =>
      `${API_BASE}/mobile/me/collateral-vault/${collateralId}/location`,
    collateralVaultAttach: (collateralId: number, applicationId: number) =>
      `${API_BASE}/mobile/me/collateral-vault/${collateralId}/attach-to-application/${applicationId}`,
    /** Staff: attach vault pledge to application without recreating. */
    staffAttachVaultCollateral: (applicationId: number, collateralId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/collateral/attach-from-vault/${collateralId}`,
    /** Staff: attach catalog guarantor to application without recreating. */
    staffAttachCatalogGuarantor: (applicationId: number, guarantorId: number) =>
      `${API_BASE}/loans/applications/${applicationId}/guarantors/attach-from-catalog/${guarantorId}`,
    staffClientVaultAttach: (clientId: number, collateralId: number, applicationId: number) =>
      `${API_BASE}/clients/${clientId}/collateral-vault/${collateralId}/attach-to-application/${applicationId}`,
    staffClientCatalogAttach: (clientId: number, guarantorId: number, applicationId: number) =>
      `${API_BASE}/clients/${clientId}/guarantors/catalog/${guarantorId}/attach-to-application/${applicationId}`,
    collateralTypeMetadata: `${API_BASE}/mobile/loan-collateral-type-metadata`,
    loanProducts: `${API_BASE}/mobile/loan-products`,
  },
  /** Borrower self-service accounts (client JWT → /mobile/me/*). */
  mobileMe: {
    accounts: `${API_BASE}/mobile/me/accounts`,
    deposits: `${API_BASE}/mobile/me/deposits`,
    transfers: `${API_BASE}/mobile/me/transfers`,
    withdrawals: `${API_BASE}/mobile/me/withdrawals`,
    collateralBalance: `${API_BASE}/mobile/me/cash-collateral/balance`,
    collateralFund: `${API_BASE}/mobile/me/cash-collateral/fund`,
    collateralLocks: `${API_BASE}/mobile/me/cash-collateral/locks`,
  },
  /**
   * Staff client ledger accounts (staff JWT → /accounts/client/*).
   * Note: dashboard BFF uses /api/clients/{id}/accounts and remaps; mobile calls the API directly.
   */
  staffClientAccounts: {
    list: (clientId: number) => `${API_BASE}/accounts/client/${clientId}`,
    createMissing: (clientId: number) => `${API_BASE}/accounts/client/${clientId}/create-missing`,
  },
  /** Staff savings ops (staff JWT → /savings-deposits|savings-withdrawals). */
  staffSavings: {
    deposits: `${API_BASE}/savings-deposits`,
    depositSubmit: (id: number) => `${API_BASE}/savings-deposits/${id}/submit`,
    depositsByClient: (clientId: number) => `${API_BASE}/savings-deposits/client/${clientId}`,
    withdrawals: `${API_BASE}/savings-withdrawals`,
    withdrawalSubmit: (id: number) => `${API_BASE}/savings-withdrawals/${id}/submit`,
    withdrawalsByClient: (clientId: number) => `${API_BASE}/savings-withdrawals/client/${clientId}`,
    transfers: `${API_BASE}/savings-deposits/transfers`,
    transferSubmit: (id: number) => `${API_BASE}/savings-deposits/transfers/${id}/submit`,
    transfersByClient: (clientId: number) => `${API_BASE}/savings-deposits/transfers/client/${clientId}`,
  },
  /** Staff cash collateral ops (staff JWT → /cash-collateral/*). */
  staffCashCollateral: {
    balance: (clientId: number) => `${API_BASE}/cash-collateral/balance/${clientId}`,
    fund: `${API_BASE}/cash-collateral/fund`,
  },
  /** CEO / GCEO investment desk (staff JWT → /investment/*). Amounts are minor units. */
  investment: {
    funds: `${API_BASE}/investment/funds/`,
    fund: (id: number) => `${API_BASE}/investment/funds/${id}`,
    fundStats: `${API_BASE}/investment/funds/statistics/summary`,
    shareholders: `${API_BASE}/investment/shareholders/`,
    shareholder: (id: number) => `${API_BASE}/investment/shareholders/${id}`,
    shareholderStats: `${API_BASE}/investment/shareholders/statistics/summary`,
    investments: `${API_BASE}/investment/investments/`,
    investment: (id: number) => `${API_BASE}/investment/investments/${id}`,
    investmentApprove: (id: number) => `${API_BASE}/investment/investments/${id}/approve`,
    investmentReject: (id: number) => `${API_BASE}/investment/investments/${id}/reject`,
    investmentStats: `${API_BASE}/investment/investments/statistics/summary`,
    allocations: `${API_BASE}/investment/allocations/`,
    allocationSummary: `${API_BASE}/investment/allocations/summary`,
  },
  /** Support URLs – open in browser when Help/Contact tapped */
  support: {
    helpFaq: 'https://cofi.mw/help',
    contact: 'mailto:support@cofi.mw',
  },
  /** AI Studio — staff-only CrewAI analytics (direct FastAPI, not web BFF). */
  aiStudio: {
    catalog: `${API_BASE}/ai-studio/catalog`,
    query: `${API_BASE}/ai-studio/query`,
    queryStream: `${API_BASE}/ai-studio/query/stream`,
    executorPlan: `${API_BASE}/ai-studio/executor/plan`,
    executorPlanStream: `${API_BASE}/ai-studio/executor/plan/stream`,
    executorExecute: `${API_BASE}/ai-studio/executor/execute`,
    sessions: `${API_BASE}/ai-studio/sessions`,
  },
} as const;
