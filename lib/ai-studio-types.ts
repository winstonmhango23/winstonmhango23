/** Types for CoFi AI Studio API responses (mobile ↔ FastAPI direct). */

export type QueryMode =
  | 'analytical'
  | 'portfolio'
  | 'operations'
  | 'accounting'
  | 'compliance'
  | 'executive'
  | 'investor'
  | 'origination'
  | 'executor';

export type ExecutorActionType =
  | 'create_loan_drawdown'
  | 'approve_loan_drawdown'
  | 'upsert_investment_allocation'
  | 'approve_shareholder_investment'
  | 'set_investment_service_preferences'
  | 'generate_staff_report'
  | 'verify_disbursement_requirements'
  | 'generate_crb_report'
  | 'attach_funding_pool_to_loan'
  | 'attach_funding_pool_to_application'
  | 'bulk_attach_funding_pool'
  | 'create_audit_finding'
  | 'update_audit_finding';

export type ExecutorRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type PresentationStyle = 'narrative' | 'dashboard' | 'report' | 'briefing';

export interface AiChartSpec {
  chart_type: 'line' | 'bar' | 'area' | 'pie' | 'composed' | 'scatter' | 'radar' | 'funnel';
  title: string;
  x_key: string;
  series: Array<{
    key: string;
    name: string;
    data: Array<Record<string, string | number>>;
  }>;
  y_label?: string | null;
  format?: 'currency_mwk' | 'percent' | 'count' | 'number';
}

export interface AiTableSpec {
  title: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

export interface AiKpiSpec {
  label: string;
  value: string;
  delta?: string | null;
  trend?: 'up' | 'down' | 'flat' | 'neutral' | null;
  severity?: 'info' | 'success' | 'warning' | 'critical' | null;
}

export interface AiSourceCitation {
  citation_id: string;
  tool_name: string;
  source_label: string;
  module: string;
  scope: string;
  as_of: string;
  excerpt: string;
  record_count?: number | null;
}

export interface AiStudioResult {
  narrative_markdown: string;
  kpis: AiKpiSpec[];
  charts: AiChartSpec[];
  tables: AiTableSpec[];
  recommendations: string[];
  citations: string[];
  source_citations: AiSourceCitation[];
  mode: string;
  presentation: string;
  tools_used: string[];
}

export interface AiStudioCatalogItem {
  id: string;
  label: string;
  description: string;
  mode: QueryMode;
  presentation: PresentationStyle;
  example_prompts: string[];
}

export interface AiStudioCatalogResponse {
  role: string;
  allowed_modules: string[];
  catalog: AiStudioCatalogItem[];
}

export interface AiStudioQueryRequest {
  question: string;
  mode?: QueryMode;
  presentation?: PresentationStyle;
  branch_id?: number | null;
  session_id?: string | null;
  include_charts?: boolean;
  include_tables?: boolean;
  timeframe_days?: number;
}

export type ProgressStage =
  | 'planning'
  | 'crew'
  | 'tool_start'
  | 'tool_complete'
  | 'fallback'
  | 'complete'
  | string;

export type ProgressStatus = 'running' | 'complete' | 'pending' | string;

export interface StreamProgress {
  stage: ProgressStage;
  label: string;
  detail?: string | null;
  tool?: string;
  module?: string;
  status?: ProgressStatus;
  citation_id?: string;
  record_count?: number | null;
  agents?: number;
  mode?: string;
}

export interface ProgressEvent extends StreamProgress {
  id: string;
  timestamp: number;
}

export interface AiStudioSessionOut {
  id: string;
  title: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface AiStudioMessageOut {
  id: string;
  role: 'user' | 'assistant' | string;
  content_markdown: string;
  result_json?: AiStudioResult | AiExecutorPlanResult | null;
  created_at: string;
}

export interface AiExecutorAction {
  action_id: string;
  action_type: ExecutorActionType;
  label: string;
  description: string;
  params: Record<string, unknown>;
  risk_level: ExecutorRiskLevel;
  requires_confirmation: boolean;
  reversible: boolean;
}

export interface AiExecutorPlanResult extends AiStudioResult {
  proposed_actions: AiExecutorAction[];
  plan_id?: string | null;
}

export interface AiExecutorPlanRequest {
  question: string;
  branch_id?: number | null;
  session_id?: string | null;
  presentation?: PresentationStyle;
}

export interface AiExecutorActionConfirm {
  action_id: string;
  action_type: ExecutorActionType;
  params: Record<string, unknown>;
}

export interface AiExecutorExecuteRequest {
  plan_id?: string | null;
  session_id?: string | null;
  confirmed_actions: AiExecutorActionConfirm[];
  execution_notes?: string | null;
}

export interface AiExecutorActionOutcome {
  action_id: string;
  action_type: ExecutorActionType;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  result?: Record<string, unknown> | null;
}

export interface AiExecutorExecuteResult {
  plan_id?: string | null;
  outcomes: AiExecutorActionOutcome[];
  success_count: number;
  failed_count: number;
}

export function isExecutorPlanResult(
  result: AiStudioResult | AiExecutorPlanResult | null | undefined
): result is AiExecutorPlanResult {
  return !!result && Array.isArray((result as AiExecutorPlanResult).proposed_actions);
}
