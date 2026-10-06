/**
 * Visual + UX metadata for AI Studio catalog templates.
 * IDs align with backCFAPi app/services/ai_studio/service.py CATALOG.
 */

import type { AiStudioCatalogItem, PresentationStyle, QueryMode } from '@/lib/ai-studio-types';

export type TemplateVisual = {
  icon: string;
  gradient: [string, string, string];
  accent: string;
  tag: string;
};

export const TEMPLATE_VISUALS: Record<string, TemplateVisual> = {
  'par-dashboard': {
    icon: 'warning-amber',
    gradient: ['#0c4a6e', '#0369a1', '#0ea5e9'],
    accent: '#0ea5e9',
    tag: 'Portfolio',
  },
  'collections-brief': {
    icon: 'payments',
    gradient: ['#14532d', '#15803d', '#22c55e'],
    accent: '#22c55e',
    tag: 'Operations',
  },
  'risk-concentration': {
    icon: 'pie-chart',
    gradient: ['#7c2d12', '#c2410c', '#f97316'],
    accent: '#f97316',
    tag: 'Risk',
  },
  'origination-pipeline': {
    icon: 'assignment',
    gradient: ['#312e81', '#4f46e5', '#818cf8'],
    accent: '#818cf8',
    tag: 'Origination',
  },
  'executive-brief': {
    icon: 'business-center',
    gradient: ['#1e1b4b', '#3730a3', '#6366f1'],
    accent: '#6366f1',
    tag: 'Executive',
  },
  'gl-snapshot': {
    icon: 'account-balance',
    gradient: ['#134e4a', '#0f766e', '#14b8a6'],
    accent: '#14b8a6',
    tag: 'Finance',
  },
  'compliance-regulatory': {
    icon: 'gavel',
    gradient: ['#4c0519', '#9f1239', '#fb7185'],
    accent: '#fb7185',
    tag: 'Compliance',
  },
  'investor-update': {
    icon: 'trending-up',
    gradient: ['#422006', '#a16207', '#fbbf24'],
    accent: '#fbbf24',
    tag: 'Investor',
  },
  'drawdown-create': {
    icon: 'account-balance-wallet',
    gradient: ['#713f12', '#b45309', '#fbbf24'],
    accent: '#f59e0b',
    tag: 'Executor',
  },
  'investment-funding-flow': {
    icon: 'savings',
    gradient: ['#14532d', '#047857', '#34d399'],
    accent: '#10b981',
    tag: 'Executor',
  },
  'ops-verification': {
    icon: 'fact-check',
    gradient: ['#1e3a5f', '#2563eb', '#60a5fa'],
    accent: '#3b82f6',
    tag: 'Executor',
  },
  'investment-assignment-audit': {
    icon: 'link',
    gradient: ['#312e81', '#4f46e5', '#a78bfa'],
    accent: '#8b5cf6',
    tag: 'Investment',
  },
  'investment-assignment-summary': {
    icon: 'pie-chart',
    gradient: ['#134e4a', '#0d9488', '#5eead4'],
    accent: '#14b8a6',
    tag: 'Investment',
  },
  'audit-findings-brief': {
    icon: 'gavel',
    gradient: ['#1e1b4b', '#4338ca', '#818cf8'],
    accent: '#6366f1',
    tag: 'Audit',
  },
  'audit-trail-review': {
    icon: 'history',
    gradient: ['#0f172a', '#334155', '#94a3b8'],
    accent: '#64748b',
    tag: 'Audit',
  },
  'audit-risk-compliance': {
    icon: 'security',
    gradient: ['#450a0a', '#b91c1c', '#fca5a5'],
    accent: '#ef4444',
    tag: 'Audit',
  },
  'audit-loan-book': {
    icon: 'account-balance',
    gradient: ['#1e3a5f', '#2563eb', '#93c5fd'],
    accent: '#3b82f6',
    tag: 'Audit',
  },
  'audit-findings-ops': {
    icon: 'fact-check',
    gradient: ['#422006', '#c2410c', '#fdba74'],
    accent: '#f97316',
    tag: 'Executor',
  },
  'crb-officer-book': {
    icon: 'assignment-ind',
    gradient: ['#0c4a6e', '#0369a1', '#38bdf8'],
    accent: '#0ea5e9',
    tag: 'CRB',
  },
  'crb-supervised-portfolio': {
    icon: 'groups',
    gradient: ['#1e1b4b', '#4338ca', '#818cf8'],
    accent: '#6366f1',
    tag: 'CRB',
  },
  'crb-branch-package': {
    icon: 'account-balance',
    gradient: ['#134e4a', '#0f766e', '#2dd4bf'],
    accent: '#14b8a6',
    tag: 'CRB',
  },
  'crb-inbox-review': {
    icon: 'inbox',
    gradient: ['#3b0764', '#7c3aed', '#c4b5fd'],
    accent: '#8b5cf6',
    tag: 'CRB',
  },
  'crb-client-loan': {
    icon: 'person-search',
    gradient: ['#312e81', '#4f46e5', '#a5b4fc'],
    accent: '#818cf8',
    tag: 'CRB',
  },
  'crb-bureau-readiness': {
    icon: 'fact-check',
    gradient: ['#4c0519', '#9f1239', '#fb7185'],
    accent: '#fb7185',
    tag: 'CRB',
  },
  'crb-generate': {
    icon: 'description',
    gradient: ['#422006', '#b45309', '#fbbf24'],
    accent: '#f59e0b',
    tag: 'CRB',
  },
};

const FALLBACK_VISUAL: TemplateVisual = {
  icon: 'auto-awesome',
  gradient: ['#0a3d7a', '#1d4ed8', '#38bdf8'],
  accent: '#38bdf8',
  tag: 'Analysis',
};

export function templateVisual(item: AiStudioCatalogItem): TemplateVisual {
  return TEMPLATE_VISUALS[item.id] ?? FALLBACK_VISUAL;
}

export const MODE_LABELS: Record<QueryMode, string> = {
  analytical: 'General analysis',
  portfolio: 'Portfolio & PAR',
  operations: 'Operations',
  accounting: 'Finance & GL',
  compliance: 'Regulatory',
  executive: 'Executive briefing',
  investor: 'Investor relations',
  origination: 'Origination',
  executor: 'Executor',
};

export const PRESENTATION_LABELS: Record<PresentationStyle, string> = {
  narrative: 'Narrative',
  dashboard: 'Dashboard',
  report: 'Report',
  briefing: 'Briefing',
};

export const QUICK_PROMPTS = [
  'What is our PAR 30 trend and which products drive it?',
  'Summarise repayment collections in the last 30 days',
  'Generate an ACTIVE_LOANS_CRB snapshot for the clients and loans in my role scope',
  'Are Credit Data and TransUnion files ready — NEW vs EXISTING rows and PAR 30+?',
  'What CRB reports are waiting in my inbox?',
] as const;
