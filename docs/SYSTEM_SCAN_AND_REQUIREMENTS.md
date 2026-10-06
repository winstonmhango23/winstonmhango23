# CoFi Loan Management App — Comprehensive System Scan, Requirements & Implementation Guide

> **Generated:** July 2026
> **Scope:** Full-scale deep scan of `loanmanagementapp` (Expo/React Native Mobile) and `cofi-bms-api` (FastAPI Backend)
> **Documents referenced:** PRODUCTION_UPGRADES.md, MOBILE_APP_IMPLEMENTATION_PLAN.md, IMPLEMENTATION_VERIFICATION.md, IMPLEMENTATION_COMPLETE.md, MOBILE_APP_LOAN_MANAGEMENT_UPGRADE_GUIDE.md, API_REFERENCE.md

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Current State — What Exists](#3-current-state--what-exists)
4. [PRODUCTION_UPGRADES.md — Status Analysis](#4-production_upgradesmd--status-analysis)
5. [Client-Side Gaps: API Backend vs Mobile Frontend](#5-client-side-gaps-api-backend-vs-mobile-frontend)
6. [UI/UX Requirements](#6-uiux-requirements)
7. [Functional Requirements](#7-functional-requirements)
8. [Implementation Guide](#8-implementation-guide)
9. [Implementation Tracker](#9-implementation-tracker)
10. [Risk Assessment & Mitigations](#10-risk-assessment--mitigations)

---

## 1. Executive Summary

The **CoFi Loan Management App** is an Expo (React Native) mobile application serving **two user roles**: **Clients (borrowers)** for self-service loan management, and **Staff (loan officers)** for client and portfolio management. The app communicates with the **cofi-bms-api** backend (FastAPI monolith, PostgreSQL, Redis/Celery) hosted on Railway.

### What's Working
- Full offline-first architecture with SQLite + sync queue + online sync
- Client self-service: loan applications (4-step wizard), loans, repayments, accounts, notifications, surveys, Airtel Money repayments
- Staff operations: application queue + approve/reject/disburse, client search/detail/edit, repayments hub (due/overdue/upcoming), notifications
- Group lending: member management, leaders, credential provisioning, group loan origination validation
- Production utilities: ErrorBoundary, logger, performance monitor, network manager, production-init

### What's Missing (High-Level)
1. **Major API surface not wired**: 60%+ of backend API endpoints lack mobile UI (collections, compliance, portfolio, CRM, accounting, GL, etc.)
2. **Production hardening gaps**: No remote crash reporting, no analytics, no systematic performance monitoring, no push notification delivery
3. **Group lending UX incomplete**: Group loan origination wizard partially implemented; group aggregate/allocation visualization missing
4. **Loan officer workflow limited**: Only basic approve/reject/disburse; no full origination workflow (CIO/PM/CEO multi-stage), no collateral/guarantor management, no penalty/waiver
5. **No executive/management views**: Portfolio dashboards, risk analysis, reporting absent
6. **No end-to-end integration tests**: Offline → sync → verify flow untested

### Key Metrics

| Metric | Current | Target |
|--------|---------|--------|
| API endpoints integrated | ~40 | ~80+ |
| Screens implemented | 25 | 45+ |
| Production utilities integrated | 7/7 | 7/7 |
| Remote crash reporting | ❌ | ✅ |
| Push notification delivery | ❌ | ✅ |
| End-to-end tests | 0 | 15+ |
| User roles supported | 2 (Client, Staff LO) | 5+ (adds Ops, Accountant, Manager) |

---

## 2. System Architecture Overview

### 2.1 Mobile App Architecture (loanmanagementapp)

```
┌─────────────────────────────────────────────────────┐
│                   Mobile App                         │
│  ┌──────────────────────────────────────────────┐   │
│  │           Expo Router (file-based)            │   │
│  │  app/_layout.tsx → (client)/  (staff)/       │   │
│  ├──────────────────────────────────────────────┤   │
│  │              Zustand Stores                   │   │
│  │  auth, clients, loans, applications,          │   │
│  │  accounts, repayments, notifications, profile │   │
│  ├──────────────────────────────────────────────┤   │
│  │            UI Components Layer                │   │
│  │  BankingCard, InputField, AmountText,         │   │
│  │  LoanCard, RepaymentCard, Modal wizards       │   │
│  ├──────────────────────────────────────────────┤   │
│  │           Data Layer (lib/data/)              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ api.ts   │  │ sqlite.ts│  │ index.ts │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  ├──────────────────────────────────────────────┤   │
│  │            Core Lib Layer                     │   │
│  │  api-client.ts  logger.ts  network-manager.ts│   │
│  │  cache.ts  storage.ts  production-init.ts    │   │
│  │  performance-monitor.ts  notification-api.ts │   │
│  ├──────────────────────────────────────────────┤   │
│  │              Sync Engine                      │   │
│  │  sync-service.ts  network-listener.ts         │   │
│  │  schema.ts  (SQLite schema+ migrations)       │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS / REST
┌─────────────────────▼───────────────────────────────┐
│              cofi-bms-api (FastAPI)                  │
│  ┌──────────────────────────────────────────────┐   │
│  │  API Layer (55+ routers, ~350+ endpoints)     │   │
│  ├──────────────────────────────────────────────┤   │
│  │  Business Logic (Services)                    │   │
│  │  Loan origination, repayments scheduling,    │   │
│  │  accounting, risk, compliance, collections   │   │
│  ├──────────────────────────────────────────────┤   │
│  │  Data Access (Repositories + SQLAlchemy)      │   │
│  ├──────────────────────────────────────────────┤   │
│  │  Background Tasks (Celery)                    │   │
│  │  GL posting, dashboard refresh, accruals,    │   │
│  │  notifications, reminders                    │   │
│  ├──────────────────────────────────────────────┤   │
│  │  Database (PostgreSQL on Railway)             │   │
│  │  100+ models across 44 files                 │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.2 Backend API Modules vs Frontend Coverage

| API Module | Endpoints | Mobile Coverage | Gap % |
|-----------|-----------|----------------|-------|
| Auth (staff + client) | ~10 | Full | 0% |
| Client Management | ~30 | Read, Search, Verify | ~60% |
| Loans (applications) | ~25 | Apply, List, Detail, Approve/Reject | ~40% |
| Loans (active) | ~15 | My Loans, Schedule, Repayments | ~30% |
| Loan Products | ~25 | Read products only | ~85% |
| Repayments | ~10 | Due/Overdue/Upcoming, Record | ~20% |
| Staff | ~30 | Digest, Notifications only | ~70% |
| Customer Portal | ~12 | Dashboard, Profile, Apps, Schedules, Repayments | ~80% |
| Mobile/Me (accounts) | ~8 | Full | 0% |
| Survey | ~6 | Full | 0% |
| Device | ~2 | Push token | ~50% |
| Group Lending | ~10 | Members, Leaders, Aggregate, Coupons | ~40% |
| Collections | ~25 | None | 100% |
| Compliance | ~20 | None | 100% |
| Portfolio | ~20 | None | 100% |
| CRM | ~20 | None | 100% |
| General Ledger | ~30 | None | 100% |
| Operations | ~15 | None | 100% |
| Accounting | ~10 | None | 100% |
| Auditing | ~15 | None | 100% |
| Risk | ~10 | None | 100% |
| Messaging | ~10 | None | 100% |
| Payroll | ~10 | None | 100% |
| Investment | ~15 | None | 100% |
| Geolocation | ~5 | Partial (business location capture) | ~60% |
| Media/Documents | ~10 | Upload, List | ~30% |
| **TOTAL** | **~350** | **~40 integrated** | **~75%** |

---

## 3. Current State — What Exists

### 3.1 Fully Implemented Features

| # | Feature | Client | Staff | Files |
|---|---------|--------|-------|-------|
| 1 | JWT Auth (login, register, forgot/reset password) | ✅ | ✅ | `app/login.tsx`, `app/register.tsx`, `store/auth.ts` |
| 2 | Role-based routing (client tabs vs staff tabs) | ✅ | ✅ | `app/(client)/_layout.tsx`, `app/(staff)/_layout.tsx` |
| 3 | Client Dashboard (summary cards) | ✅ | — | `app/(client)/index.tsx` |
| 4 | Staff Dashboard (digest, due/overdue/upcoming) | — | ✅ | `app/(staff)/index.tsx` |
| 5 | Loan Applications — 4-step wizard (Personal → Loan Details → Documents → Review) | ✅ | — | `components/client-loan-application-modal.tsx` |
| 6 | Loan Applications — 5-step wizard (Client → Product → Amount → Docs → Review) | — | ✅ | `components/staff-loan-application-modal.tsx` |
| 7 | Applications queue + detail + approve/reject/disburse | — | ✅ | `app/(staff)/applications/`, `components/application-detail-modal.tsx` |
| 8 | My Loans list + detail + schedule | ✅ | — | `app/(client)/loans/` |
| 9 | All/assigned loans list + detail + schedule + repayments | — | ✅ | `app/(staff)/loans/` |
| 10 | Repayment history | ✅ | — | `app/(client)/repayments.tsx` |
| 11 | Repayment hub (due/overdue/upcoming) + Record Payment | — | ✅ | `app/(staff)/repayments/`, `components/record-payment-modal.tsx` |
| 12 | Client list + search + detail + edit + verify + camera | — | ✅ | `app/(staff)/clients/` |
| 13 | Group members list, add member, leaders management | — | ✅ | `app/(staff)/clients/[id]/members.tsx`, `leaders.tsx`, `add-member.tsx` |
| 14 | Client bank accounts + deposits + withdrawals + transfers + cash collateral | ✅ | — | `app/(client)/accounts/` |
| 15 | Group member credential provisioning | ✅ | — | `app/(client)/group-member-logins.tsx` |
| 16 | Notifications list + detail + unread badge | ✅ | ✅ | `app/(client)/notifications/`, `app/(staff)/notifications/` |
| 17 | Staff digest notification preferences | — | ✅ | `app/(staff)/notification-settings.tsx` |
| 18 | Profile editing | ✅ | ✅ | `app/(client)/profile.tsx`, `app/(staff)/profile/` |
| 19 | Survey pending prompts + batch respond | ✅ | — | `components/survey-prompt.tsx`, `store/survey.ts` |
| 20 | Offline-first: SQLite write + sync queue + online replay | ✅ | ✅ | `lib/data/`, `lib/sync/` |
| 21 | Offline banner + sync failed banner + sync status badges | ✅ | ✅ | `components/offline-banner.tsx`, `sync-failed-banner.tsx`, `sync-status-badge.tsx` |
| 22 | Geolocation capture for business location | — | ✅ | `lib/data/geolocation-types.ts` |
| 23 | Document upload (image compress + FormData) | ✅ | ✅ | `lib/data/mediaService.ts`, `lib/media/compress-image.ts` |
| 24 | Deep linking (loanmanagementapp://) | ✅ | ✅ | `hooks/use-deep-link.ts`, `lib/navigation/notification-redirect.ts` |
| 25 | Airtel Money self-service repayment | ✅ | — | `lib/config.ts` airtel endpoints |
| 26 | Production utilities (ErrorBoundary, logger, network-manager, perf-monitor, production-init) | ✅ | ✅ | `lib/` + `components/error-boundary.tsx` |

### 3.2 Partially Implemented Features

| # | Feature | Current | Missing |
|---|---------|---------|---------|
| 1 | Group loan origination | Validation call wired, allocation in payload | Full UI for member allocation breakdown, per-member pledgor collateral selector |
| 2 | Cash collateral (client side) | Balance view, fund operation | Locks list view, release UI |
| 3 | Notification preferences | UI toggles exist | Not persisted to API (`PUT /customer/settings`) |
| 4 | Push notifications | Token registration wired (`POST /device/push-token`) | FCM setup, push receipt handling, foreground notification display |
| 5 | Loan schedule visualization | Schedule lines in list | Visual repayment calendar, payment progress chart |
| 6 | Client repayment history | Data loaded | No client-scoped `GET /customer/repayments` filtering by date range |

### 3.3 Production Infrastructure (Verified)

| Component | File | Status | Integration |
|-----------|------|--------|-------------|
| ErrorBoundary | `components/error-boundary.tsx` | ✅ | Wraps root layout |
| Logger | `lib/logger.ts` | ✅ | Imported in root layout, stores, data layer |
| API Client | `lib/api-client.ts` | ✅ | Token refresh, timeout, request IDs |
| Network Manager | `lib/network-manager.ts` | ✅ | 5s debounce, listeners |
| Performance Monitor | `lib/performance-monitor.ts` | ✅ | Library exists, minimal active usage |
| Production Init | `lib/production-init.ts` | ✅ | Called in root layout |
| Sync Network Listener | `lib/sync/network-listener.ts` | ✅ | Integrates with network manager |
| TypeScript Strict | `tsconfig.json` | ✅ | All strict flags enabled |

---

## 4. PRODUCTION_UPGRADES.md — Status Analysis

### 4.1 Document vs Reality

| Section | Claimed in PRODUCTION_UPGRADES.md | Actual Codebase Status | Verdict |
|---------|-----------------------------------|----------------------|---------|
| **1. Logger** | Severity levels, contextual, buffer, console formatting | ✅ Implemented (`lib/logger.ts`) | ✅ **Complete** |
| **2. API Client** | Request IDs, timeout, token refresh, error handling | ✅ Implemented (`lib/api-client.ts`) | ✅ **Complete** |
| **3. Network Manager** | Reliable detection, debouncing, fallback, listeners | ✅ Implemented (`lib/network-manager.ts`) | ✅ **Complete** |
| **4. Sync Network Listener** | Integrates with network manager, logging, error handling | ✅ Implemented (`lib/sync/network-listener.ts`) | ✅ **Complete** |
| **5. Performance Monitor** | Metric recording, aggregation, slow op alerts, summary | ✅ Implemented (`lib/performance-monitor.ts`) | ✅ **Complete** (but **underutilized**) |
| **6. Error Boundary** | Graceful error handling, user-friendly UI, dev stack | ✅ Implemented (`components/error-boundary.tsx`) | ✅ **Complete** |
| **7. Production Init** | Centralized setup, dependency ordering, error resilience | ✅ Implemented (`lib/production-init.ts`) | ✅ **Complete** |
| **8. TS Strict Mode** | noUnusedLocals, noUnusedParameters, noImplicitReturns, etc. | ✅ Configured (`tsconfig.json`) | ✅ **Complete** |
| **9. Removed Placeholder Assets** | Deleted demo files | ✅ Assets cleaned | ✅ **Complete** |
| **10. Cleaned Test Data Exports** | Removed direct test data exports | ✅ Only types remain | ✅ **Complete** |

### 4.2 Integration Checklist — Actual Status

| Checklist Item | Status | Evidence |
|---------------|--------|----------|
| Integrate ErrorBoundary in root layout | ✅ Done | `app/_layout.tsx:66` |
| Call `initializeProduction()` on startup | ✅ Done | `app/_layout.tsx:52` |
| Update error handling to use ApiClientError | ⚠️ Partial | Used in `lib/data/api.ts` but not consistently across all stores |
| Monitor performance metrics during development | ❌ Not Done | Library unused; no systematic perf tracking |
| Use logger instead of console.log | ⚠️ Partial | Logger used in major paths; grep likely shows remaining console.log calls |
| Test network recovery flows | ❌ Not Done | No automated tests; no QA run documented |
| Set up remote crash reporting | ❌ Not Done | Listed as future improvement |
| Monitor API response times | ❌ Not Done | Performance monitor not actively used |

### 4.3 Future Improvements (from PRODUCTION_UPGRADES.md)

| Item | Status | Priority |
|------|--------|----------|
| Sentry integration | ❌ Not started | **HIGH** |
| Analytics integration | ❌ Not started | **MEDIUM** |
| Request/response caching strategy | ❌ Not started | **MEDIUM** |
| Offline queue persistence metrics | ❌ Not started | **LOW** |
| User session tracking | ❌ Not started | **MEDIUM** |
| Performance budgets | ❌ Not started | **LOW** |

---

## 5. Client-Side Gaps: API Backend vs Mobile Frontend

This section documents every backend capability that either has **no mobile UI** or has **incomplete mobile UI**.

### 5.1 Critical Gaps (High Priority — Required for Production Parity)

#### Gap G1 — Push Notification Delivery
- **Backend**: `POST /device/push-token`, `GET /staff/notifications`, WebSocket `/ws/notifications`
- **Mobile**: Token registration wired (`lib/data/api.ts`), but **no FCM setup**, **no push handler**, **no foreground notification display**, **no notification tap handling**
- **Impact**: Users get zero push notifications; critical for repayment reminders and loan status changes
- **Files to modify**: `app/_layout.tsx`, `lib/notifications.ts`, `hooks/use-push-setup.ts`

#### Gap G2 — Full Loan Origination Workflow
- **Backend**: Multi-stage workflow (DRAFT → SUBMITTED_TO_CIO → CIO_VERIFIED_TO_PM → SUBMITTED_TO_CEO → PENDING_DISBURSEMENT) with `POST /loans/applications/{id}/origination/transition`
- **Mobile**: Only basic approve/reject/disburse buttons
- **Impact**: Loan officers cannot advance applications through proper approval chains; bypasses CIO/PM/CEO workflows
- **Files to modify**: `components/application-detail-modal.tsx`, `store/applications.ts`, `lib/data/api.ts`

#### Gap G3 — End-to-End Offline Sync Testing
- **Backend**: All endpoints support normal REST
- **Mobile**: SQLite writes + sync queue exists but **no automated tests** for offline → sync → verify
- **Impact**: Risk of data loss or corruption in offline scenarios
- **Files to create**: `__tests__/sync-e2e.test.ts`

#### Gap G4 — Remote Crash & Error Reporting
- **Backend**: N/A
- **Mobile**: Logger buffer exists but not sent anywhere
- **Impact**: Production crashes invisible to developers
- **Files to modify**: `lib/production-init.ts`, add Sentry SDK to `package.json`

#### Gap G5 — Group Loan Origination Full UX
- **Backend**: `POST /loans/applications/validate-group-origination`, group loan allocation, per-member pledgor collateral
- **Mobile**: Validation call wired, allocation in payload, but **missing**:
  - Visual member allocation breakdown in loan wizard
  - Per-member pledgor collateral selector
  - Group aggregate / capacity visualization in staff loan wizard
  - Read-only group allocation display in application detail
- **Files to modify**: `components/staff-loan-application-modal.tsx`, `components/application-detail-modal.tsx`, `lib/data/group-loan-types.ts`

### 5.2 Major Gaps (Medium Priority — Feature Parity with Web)

#### Gap G6 — Collections & Delinquency Management
- **Backend**: 25+ endpoints: `GET /collections/delinquency`, `POST /collections/cases`, `POST /collections/activities`, `POST /collections/recovery`, `POST /collections/write-offs`
- **Mobile**: **Nothing**
- **Files to create**: `app/(staff)/collections/`, `store/collections.ts`, `components/collection-case-list.tsx`, `components/collection-case-detail.tsx`

#### Gap G7 — Compliance Operations
- **Backend**: 20+ endpoints for KYC, AML, regulatory reports, compliance audits, sanctions screening, CDD profiles
- **Mobile**: **Nothing**
- **Files to create**: `app/(staff)/compliance/`, `store/compliance.ts`

#### Gap G8 — Full Client Lifecycle Management
- **Backend**: `POST /clients/` (create), `DELETE /clients/{id}` (delete), `POST /clients/bulk-delete`, `GET /clients/{id}/documents`, `POST /clients/{id}/documents`, `GET /clients/{id}/collateral-vault`, `POST /clients/{id}/collateral-vault`, `PATCH /clients/{id}/assign`, `POST /clients/{id}/transfer/{branch}`
- **Mobile**: Only client read, search, edit, verify
- **Missing**: Create client, delete client, document management per client, collateral vault management, staff assignment, branch transfer
- **Files to modify**: `app/(staff)/clients/`, `store/clients.ts`

#### Gap G9 — Loan Account Management (Active Loans)
- **Backend**: `POST /loans/{loan_id}/collateral`, `POST /loans/{loan_id}/guarantor`, `POST /loans/{loan_id}/penalty`, `POST /loans/{loan_id}/waiver`, `POST /loans/{loan_id}/documents`, `POST /loans/{loan_id}/workout-requests`, `GET /loans/{id}/notes`, `POST /loans/{id}/notes`
- **Mobile**: Only schedule, repayments, and basic detail view
- **Missing**: Collateral management, guarantor management, penalty/waiver, loan documents, workout requests, loan notes
- **Files to create**: `app/(staff)/loans/[id]/collateral.tsx`, `guarantors.tsx`, `penalties.tsx`, `waivers.tsx`, `documents.tsx`, `notes.tsx`, `workout.tsx`

#### Gap G10 — Savings Deposits & Withdrawals
- **Backend**: `POST /savings-deposits`, `POST /savings-withdrawals`, `GET /savings-deposits`, `GET /savings-withdrawals`, lifecycle management (submit → verify → post)
- **Mobile**: Client can view accounts and do transfers, but **staff cannot process deposits/withdrawals** on behalf of clients
- **Files to create**: `app/(staff)/savings/`, `store/savings.ts`

### 5.3 Enhancement Gaps (Low-Medium Priority — Post-Production)

#### Gap G11 — Loan Product Management
- **Backend**: Full CRUD for products, categories, strategies, governance, spec import, lifecycle, activation
- **Mobile**: Read-only product list
- **Priority**: LOW (product mgmt is primarily a back-office function)

#### Gap G12 — Portfolio Dashboards
- **Backend**: Portfolio risk, profitability, client lifetime value, default prediction, custom reports, benchmarks
- **Mobile**: **Nothing**

#### Gap G13 — Staff Messaging
- **Backend**: Conversations, messages, reactions, presence, WebSocket
- **Mobile**: **Nothing**

#### Gap G14 — Operations & Accounting Workspaces
- **Backend**: Ops officer dashboard, ops manager dashboard, accountant workspace (disbursements, repayments, suspense)
- **Mobile**: **Nothing**

#### Gap G15 — General Ledger
- **Backend**: Chart of accounts, journals, statements, ECL, QuickBooks
- **Mobile**: **Nothing** (back-office only)

#### Gap G16 — Auditing
- **Backend**: Internal auditor dashboard, external auditor scoped access, findings, uploads
- **Mobile**: **Nothing**

#### Gap G17 — Investment Management
- **Backend**: Funds, shareholders, investments, allocations, WebSocket
- **Mobile**: **Nothing**

#### Gap G18 — Payroll
- **Backend**: Employees, expense categories, payroll runs
- **Mobile**: **Nothing**

#### Gap G19 — CRM
- **Backend**: Customer segments, communication history, cross-selling, leads, marketing campaigns
- **Mobile**: **Nothing**

#### Gap G20 — Additional Payment Channels
- **Backend**: TNM MPamba (likely available)
- **Mobile**: Only Airtel Money wired

### 5.4 Gap Summary

| Category | Gaps | Priority |
|----------|------|----------|
| **Production Hardening** | G1 Push, G4 Crash Reporting, G3 E2E Tests | CRITICAL |
| **Loan Origination** | G2 Workflow, G5 Group Full UX | HIGH |
| **Feature Parity (Web → Mobile)** | G6 Collections, G7 Compliance, G8 Client Lifecycle, G9 Loan Mgmt, G10 Savings | HIGH |
| **Enhancements** | G11-G20 Product, Portfolio, Messaging, Ops, etc. | MED/LOW |

---

## 6. UI/UX Requirements

### 6.1 Design Principles

1. **Offline-First by Default**: Every screen must work offline. Show cached data with sync status indicators.
2. **Role-Appropriate**: Screens and actions must respect user role. A client should never see staff-only actions.
3. **Progressive Disclosure**: Complex operations (loan origination workflow) show simplified views first, with "advanced" expandable sections.
4. **Consistent Visual Language**: Use the existing CoFi design system (`constants/theme.ts` — navy/gold/amber/green/red).
5. **Touch-Optimized**: Minimum 44pt touch targets, swipeable cards, bottom-sheet modals for actions.
6. **Real-Time Feedback**: Optimistic UI updates with sync status badges. Show "Syncing...", "Saved", "Failed - tap to retry".

### 6.2 Existing UI Components (Reuse Where Possible)

| Component | Path | Use For |
|-----------|------|---------|
| `BankingCard` | `components/ui/banking-card.tsx` | Dashboard summaries, account cards |
| `AmountText` | `components/ui/amount-text.tsx` | Any MWK monetary value display |
| `InputField` | `components/ui/input-field.tsx` | Form inputs |
| `StatusBadge` | (inside list-card) | Application/loan status display |
| `ProgressBar` | `components/ui/progress-bar.tsx` | Loan repayment progress |
| `OfflineBanner` | `components/ui/offline-banner.tsx` | Offline indicator |
| `SyncFailedBanner` | `components/ui/sync-failed-banner.tsx` | Sync error display |
| `SyncStatusBadge` | `components/ui/sync-status-badge.tsx` | Per-item sync state |
| `LoanCard` | `components/loan-card.tsx` | Loan list items |
| `RepaymentCard` | `components/repayment-card.tsx` | Repayment schedule items |
| `ListCard` | `components/ui/list-card.tsx` | Generic list items |
| `Collapsible` | `components/ui/collapsible.tsx` | Expandable sections |
| `IconSymbol` | `components/ui/icon-symbol.tsx` | Icons |
| `TabBar` | `components/ui/tab-bar.tsx` | Bottom tab navigation |

### 6.3 New UI Requirements

#### Screen: Group Loan Allocation Breakdown (Staff)
- **When**: In staff loan application wizard, when client type is GROUP/COOPERATIVE
- **UI**: After selecting group, show member cards with checkboxes, loan amount input per member. Show total allocation vs loan amount with real-time balance.
- **Input fields**: Member name (read-only), allocated amount (numeric input), percentage (auto-calc)
- **Validation**: Total allocation must equal loan amount
- **Reference**: `POST /loans/applications/validate-group-origination`

#### Screen: Workflow Approval Chain (Staff)
- **When**: Application detail view for pending applications
- **UI**: Show current stage in origination workflow with timeline/progress indicator. Show who can approve next. Show history of previous approvals.
- **Actions**: "Submit to CIO", "CIO Verify → PM", "PM Approve → CEO" buttons depending on current user's role
- **Reference**: `POST /loans/applications/{id}/origination/transition`

#### Screen: Collections Dashboard (Staff)
- **When**: New tab or section in staff app
- **UI**: Three sections: Delinquent Loans (overdue >30d), Active Cases, Recovery Queue. Each with count badges.
- **List items**: Client name, loan amount, overdue amount, days overdue, assigned collector
- **Action**: Create collection case, log collection activity, recommend write-off

#### Screen: Client Loan Document Management (Staff)
- **When**: Loan detail view
- **UI**: Document list with type (KYCDoc, GuarantorForm, BusinessPlan, etc.), upload date, download button
- **Action**: Upload new document (document picker → compress → upload)

#### Screen: Loan Guarantor Management (Staff)
- **When**: Loan detail view
- **UI**: List of guarantors with name, relationship, guaranteed amount, status (active/released)
- **Action**: Add guarantor (search client) with guaranteed amount input

#### Screen: Compliance — KYC Verification (Staff)
- **When**: New compliance section
- **UI**: Queue of clients pending KYC verification. Each item shows documents uploaded, identity info
- **Action**: Verify identity documents, mark KYC as complete, flag for review

#### Screen: Savings Deposit/Withdrawal (Staff)
- **When**: Staff client detail view
- **UI**: "Record Deposit" and "Process Withdrawal" buttons. Form with account selector, amount, reference, notes
- **Action**: Submit for verification, then post

#### Screen: Crash Error Log Viewer (Dev/Admin)
- **When**: Debug build
- **UI**: Accessible from profile screen (long-press or hidden toggle). Shows log buffer with severity filters, search, export
- **Reference**: `logger.getBuffer()`

### 6.4 Screen Flow Updates

#### Updated Staff Tab Navigation
```
Current: Dashboard | Applications | Loans | Clients | Repayments | Notifications | Profile
Proposed: Dashboard | Applications | Loans | Clients | Collections | Compliance | Repayments | Savings | Profile
```

#### Updated Client Tab Navigation
```
Current: Dashboard | Loans | Applications | Repayments | Profile
Proposed: Dashboard | Loans | Applications | Repayments | Notifications | Profile
```

### 6.5 UX Guidelines for New Features

- **Empty States**: Every list screen must have a helpful empty state illustration and message
- **Loading States**: Skeleton loaders for all data-fetching screens
- **Error States**: Offline-aware error messages with retry action
- **Confirmation Dialogs**: Destructive actions (reverse repayment, delete client) require two-step confirmation
- **Success Feedback**: Brief toast or banner after successful create/update/delete
- **Pull-to-Refresh**: All list screens support pull-to-refresh
- **Infinite Scroll**: Paginated lists load more on scroll to bottom

---

## 7. Functional Requirements

### 7.1 Authentication & Authorization

| ID | Requirement | Role | Priority | Gap |
|----|-------------|------|----------|-----|
| AUTH-01 | Client self-service register, login, password reset | Client | ✅ Done | — |
| AUTH-02 | Staff login with device-based access control | Staff | ✅ Done | — |
| AUTH-03 | Token refresh with exponential backoff | Both | ✅ Done | — |
| AUTH-04 | Biometric login (fingerprint/face) | Both | 🔜 New | G21 |
| AUTH-05 | Session timeout with auto-logout | Both | 🔜 New | G22 |

### 7.2 Client Self-Service

| ID | Requirement | Priority | Gap |
|----|-------------|----------|-----|
| CL-01 | View dashboard (active loans, pending apps, due repayments) | ✅ Done | — |
| CL-02 | Apply for loan (4-step wizard) | ✅ Done | — |
| CL-03 | View my loans, loan detail, repayment schedule | ✅ Done | — |
| CL-04 | View repayment history | ✅ Done | — |
| CL-05 | Pay via Airtel Money | ✅ Done | — |
| CL-06 | View accounts, deposits, withdrawals, transfers | ✅ Done | — |
| CL-07 | Fund cash collateral | ✅ Done | — |
| CL-08 | View/view cash collateral locks | ⚠️ Partial | CL-08a |
| CL-09 | View notifications | ✅ Done | — |
| CL-10 | Edit profile, update preferences | ✅ Done | — |
| CL-11 | Complete surveys | ✅ Done | — |
| CL-12 | Group chair: provision member login credentials | ✅ Done | — |
| CL-13 | **Group chair: view group loan aggregate / allocation** | 🔜 New | CL-13 |
| CL-14 | **Pay via TNM MPamba** | 🔜 New | CL-14 |
| CL-15 | **View investment fund participation** | 🔜 New | CL-15 |
| CL-16 | **Request loan restructuring / waiver** | 🔜 New | CL-16 |

### 7.3 Staff — Loan Officer

| ID | Requirement | Priority | Gap |
|----|-------------|----------|-----|
| LO-01 | View dashboard digest + due/overdue/upcoming | ✅ Done | — |
| LO-02 | View applications queue | ✅ Done | — |
| LO-03 | Review application detail | ✅ Done | — |
| LO-04 | Approve/reject/disburse application | ✅ Done | — |
| LO-05 | **Full origination workflow (submit to CIO, PM, CEO etc.)** | 🔜 New | G2 |
| LO-06 | Create loan application on behalf of client (5-step wizard) | ✅ Done | — |
| LO-07 | **Group loan wizard with member allocation UI** | 🔜 New | G5 |
| LO-08 | Search/view clients | ✅ Done | — |
| LO-09 | Edit client profile | ✅ Done | — |
| LO-10 | Verify client (KYC) | ✅ Done | — |
| LO-11 | **Create new client** | 🔜 New | G8 |
| LO-12 | **Manage client documents** | 🔜 New | G8 |
| LO-13 | **Manage client collateral vault** | 🔜 New | G8 |
| LO-14 | **Transfer client to another branch** | 🔜 New | G8 |
| LO-15 | Manage group members, leaders | ✅ Done | — |
| LO-16 | View all/assigned loans | ✅ Done | — |
| LO-17 | View loan detail, schedule, repayments | ✅ Done | — |
| LO-18 | **Manage loan collateral** | 🔜 New | G9 |
| LO-19 | **Manage loan guarantors** | 🔜 New | G9 |
| LO-20 | **Apply penalty** | 🔜 New | G9 |
| LO-21 | **Process waiver request** | 🔜 New | G9 |
| LO-22 | **Upload loan documents** | 🔜 New | G9 |
| LO-23 | **Request loan workout** | 🔜 New | G9 |
| LO-24 | **Add loan notes** | 🔜 New | G9 |
| LO-25 | View repayment hub (due/overdue/upcoming) | ✅ Done | — |
| LO-26 | Record payment | ✅ Done | — |
| LO-27 | **Reverse repayment** | 🔜 New | LO-27 |
| LO-28 | **Process savings deposit** | 🔜 New | G10 |
| LO-29 | **Process savings withdrawal** | 🔜 New | G10 |
| LO-30 | **Manage collection cases** | 🔜 New | G6 |
| LO-31 | View notifications | ✅ Done | — |
| LO-32 | Manage digest preferences | ✅ Done | — |

### 7.4 Staff — Operations / Accountant / Management

| ID | Requirement | Role | Priority | Gap |
|----|-------------|------|----------|-----|
| OPS-01 | Operations dashboard (pending disbursements, penalties, CRB) | Ops Officer | 🔜 New | G14 |
| OPS-02 | Process disbursement batches | Ops Officer | 🔜 New | G14 |
| OPS-03 | Apply penalties | Ops Officer | 🔜 New | G14 |
| OPS-04 | **Accountant workspace (disbursements, repayments, suspense)** | Accountant | 🔜 New | G14 |
| OPS-05 | **CIO dashboard (supervised loans, portfolio analytics)** | CIO | 🔜 New | G14 |
| OPS-06 | **CEO/GCEO workspaces** | CEO/GCEO | 🔜 New | G14 |
| OPS-07 | **Compliance KYC verification** | Compliance | 🔜 New | G7 |
| OPS-08 | **Portfolio dashboards & risk analysis** | Management | 🔜 New | G12 |
| OPS-09 | **Audit workspace** | Auditor | 🔜 New | G16 |

### 7.5 Offline & Sync

| ID | Requirement | Priority | Gap |
|----|-------------|----------|-----|
| SYNC-01 | All writes go to SQLite first | ✅ Done | — |
| SYNC-02 | Sync queue replays to API when online | ✅ Done | — |
| SYNC-03 | Idempotent repayments (client_reference key) | ✅ Done | — |
| SYNC-04 | Conflict detection when remote data changed | 🔜 New | SYNC-04 |
| SYNC-05 | Sync status indicators (pending/synced/failed) | ✅ Done | — |
| SYNC-06 | Manual retry of failed sync items | ✅ Done | — |
| SYNC-07 | **Lazy-load large data sets (loans, clients)** | 🔜 New | SYNC-07 |
| SYNC-08 | **Cache invalidation on sync conflict** | 🔜 New | SYNC-08 |

### 7.6 Production Readiness

| ID | Requirement | Priority | Gap |
|----|-------------|----------|-----|
| PROD-01 | ErrorBoundary wraps all screens | ✅ Done | — |
| PROD-02 | Centralized logger with buffer | ✅ Done | — |
| PROD-03 | Remote crash reporting (Sentry) | 🔜 New | G4 |
| PROD-04 | Performance monitoring active usage | 🔜 New | PROD-04 |
| PROD-05 | Analytics integration | 🔜 New | PROD-05 |
| PROD-06 | Push notification delivery | 🔜 New | G1 |
| PROD-07 | E2E tests for offline → sync flows | 🔜 New | G3 |
| PROD-08 | API response time tracking | 🔜 New | PROD-08 |

---

## 8. Implementation Guide

### 8.1 Phase 0: Production Hardening (Weeks 1-2)

**Goal**: Stabilize existing app for production deployment before adding features.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 0.1 | **Configure Sentry** — Add `@sentry/react-native`, init in `_layout.tsx`, wire logger buffer to send on crash | `package.json`, `lib/production-init.ts`, `app/_layout.tsx` | 2d | — |
| 0.2 | **Enable push notifications** — Complete FCM setup, implement push handler, display foreground notifications, handle tap-to-navigate | `app/_layout.tsx`, `lib/notifications.ts`, `hooks/use-push-setup.ts`, Firebase config | 3d | — |
| 0.3 | **Replace remaining console.log** — Grep for all `console.log/warn/error`, replace with `logger` calls | All files | 1d | — |
| 0.4 | **Add performance monitoring** — Instrument key API calls (loan apply, repayments, client search) with `performanceMonitor` | `lib/data/api.ts` | 1d | — |
| 0.5 | **Write E2E sync tests** — Test offline create → online → verify; staff repayments offline → sync | `__tests__/sync-e2e.test.ts` | 3d | — |
| 0.6 | **Verify TypeScript strict compliance** — Fix any TS errors from strict mode | Codebase-wide | 2d | — |

**Risk**: Sentry + FCM require native module builds; test on both iOS and Android simulators.

### 8.2 Phase 1: Loan Origination Workflow (Weeks 2-4)

**Goal**: Implement full multi-stage origination workflow on mobile to match web BMS.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 1.1 | **Wire `origination/transition` endpoint** — Add to `lib/config.ts`, `lib/data/api.ts` | `lib/config.ts`, `lib/data/api.ts` | 1d | — |
| 1.2 | **Update application detail modal** — Add origination stage timeline, conditional action buttons per role | `components/application-detail-modal.tsx` | 3d | 1.1 |
| 1.3 | **Update application store** — Add origination states, workflow history | `store/applications.ts` | 2d | 1.1 |
| 1.4 | **Update `OriginationStatus` types** — Add all stages from backend | `lib/data/types.ts` | 1d | — |
| 1.5 | **Test full workflow** — Create app → submit to CIO → CIO verify → PM approve → CEO approve → disburse | Manual test | 2d | 1.2-1.4 |

**Risk**: Backend origination transition rules are complex; verify each transition's preconditions.

### 8.3 Phase 2: Group Loan Origination UX (Weeks 3-5)

**Goal**: Complete group loan origination experience for loan officers.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 2.1 | **Build member allocation UI component** — Member list with amount input, percentage, validation | `components/group-allocation-editor.tsx` | 3d | — |
| 2.2 | **Integrate into staff loan wizard** — Add group branch step before review | `components/staff-loan-application-modal.tsx` | 3d | 2.1 |
| 2.3 | **Add per-member pledgor collateral selector** — Search/add pledgor for each member's collateral | `components/staff-loan-application-modal.tsx` | 3d | 2.2 |
| 2.4 | **Display group allocation read-only in app detail** — Show each member's allocated amount | `components/application-detail-modal.tsx` | 2d | — |
| 2.5 | **Wire `validate-group-origination` call in wizard** — Ensure validation before submission | `lib/data/api.ts` | 1d | 2.2 |
| 2.6 | **Group aggregate view for client role** — Show group loan summary allocation | `app/(client)/loans/[id].tsx` | 2d | — |

**Risk**: Backend validation rules for group origination must be well-understood; coordinate with API team.

### 8.4 Phase 3: Collections & Client Lifecycle (Weeks 5-8)

**Goal**: Add collections module and complete client lifecycle management.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 3.1 | **Collections store** — delinquency, cases, activities, recovery, write-offs | `store/collections.ts` | 2d | — |
| 3.2 | **Collections API wrappers** | `lib/data/api.ts` | 2d | 3.1 |
| 3.3 | **Collections dashboard screen** — Delinquent loans, active cases, recovery queue | `app/(staff)/collections/index.tsx` | 3d | 3.1-3.2 |
| 3.4 | **Collections case detail screen** — Activities log, recommended actions | `app/(staff)/collections/[id].tsx` | 3d | 3.3 |
| 3.5 | **Add new tab to staff navigation** | `app/(staff)/_layout.tsx` | 1d | 3.3-3.4 |
| 3.6 | **Client creation screen** | `app/(staff)/clients/create.tsx` | 3d | — |
| 3.7 | **Client document management screen** | `app/(staff)/clients/[id]/documents.tsx` | 2d | — |
| 3.8 | **Client collateral vault screen** | `app/(staff)/clients/[id]/collateral-vault.tsx` | 2d | — |
| 3.9 | **Client branch transfer + staff assignment** | `app/(staff)/clients/[id]/index.tsx` | 2d | — |

**Risk**: Collections module has extensive backend logic; start with read-only views before write operations.

### 8.5 Phase 4: Loan Collateral, Guarantors & Documents (Weeks 7-9)

**Goal**: Wire full loan management capabilities for loan officers.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 4.1 | **Loan collateral management screen** | `app/(staff)/loans/[id]/collateral.tsx` | 3d | — |
| 4.2 | **Loan guarantor management screen** | `app/(staff)/loans/[id]/guarantors.tsx` | 3d | — |
| 4.3 | **Penalty management screen** | `app/(staff)/loans/[id]/penalties.tsx` | 2d | — |
| 4.4 | **Waiver processing screen** | `app/(staff)/loans/[id]/waivers.tsx` | 3d | — |
| 4.5 | **Loan document upload + list screen** | `app/(staff)/loans/[id]/documents.tsx` | 2d | — |
| 4.6 | **Workout request screen** | `app/(staff)/loans/[id]/workout.tsx` | 3d | — |
| 4.7 | **Loan notes screen** | `app/(staff)/loans/[id]/notes.tsx` | 1d | — |
| 4.8 | **Add tabs to loan detail layout** | `app/(staff)/loans/[id]/_layout.tsx` | 2d | 4.1-4.7 |

**Risk**: Loan detail already renders schedule + repayments; ensure new tabs don't degrade performance.

### 8.6 Phase 5: Savings & Payments (Weeks 9-10)

**Goal**: Enable staff to process savings deposits/withdrawals and additional payment channels.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 5.1 | **Savings store + API wrappers** | `store/savings.ts`, `lib/data/savings-api.ts` | 2d | — |
| 5.2 | **Staff deposit screen** — Account selector, amount, reference, submit → verify | `app/(staff)/savings/deposit.tsx` | 3d | 5.1 |
| 5.3 | **Staff withdrawal screen** — Account selector, amount, reference, submit → verify | `app/(staff)/savings/withdrawal.tsx` | 3d | 5.1 |
| 5.4 | **TNM MPamba payment integration** | `lib/config.ts`, `lib/data/api.ts` | 2d | — |
| 5.5 | **Repayment reversal screen** | `components/record-payment-modal.tsx` | 2d | — |

### 8.7 Phase 6: Compliance & Operations (Weeks 10-13)

**Goal**: Add compliance KYC, operations dashboards, and accounting workspace.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 6.1 | **Compliance store + API** | `store/compliance.ts`, `lib/data/compliance-api.ts` | 2d | — |
| 6.2 | **KYC verification queue screen** | `app/(staff)/compliance/kyc-queue.tsx` | 3d | 6.1 |
| 6.3 | **KYC detail + verify screen** | `app/(staff)/compliance/kyc/[id].tsx` | 3d | 6.2 |
| 6.4 | **Operations officer dashboard** | `app/(staff)/operations/index.tsx` | 3d | — |
| 6.5 | **Disbursement processing screen** | `app/(staff)/operations/disbursements.tsx` | 3d | — |
| 6.6 | **Accountant workspace screen** | `app/(staff)/accountant/index.tsx` | 3d | — |

### 8.8 Phase 7: Portfolio & Analytics (Weeks 13-15)

**Goal**: Add management-level portfolio views and risk analytics.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 7.1 | **Portfolio dashboard screen** — Total portfolio, PAR, disbursements, collections | `app/(staff)/portfolio/index.tsx` | 4d | — |
| 7.2 | **Portfolio risk analysis screen** — Risk concentration, aging | `app/(staff)/portfolio/risk.tsx` | 3d | — |
| 7.3 | **Portfolio profitability screen** | `app/(staff)/portfolio/profitability.tsx` | 3d | — |
| 7.4 | **CIO dashboard screen** — Supervised loans, portfolio analytics | `app/(staff)/cio/index.tsx` | 4d | — |
| 7.5 | **CEO/GCEO dashboard screens** | `app/(staff)/ceo/index.tsx`, `gceo/index.tsx` | 4d | — |

### 8.9 Phase 8: Advanced Features (Weeks 15-18)

**Goal**: Add staff messaging, auditing, CRM, investment views.

| Task | Files | Effort | Dependencies |
|------|-------|--------|-------------|
| 8.1 | **Staff messaging screens** — Conversation list, chat view | `app/(staff)/messaging/` | 5d | — |
| 8.2 | **Audit workspace screens** — Findings, uploads, external access | `app/(staff)/audit/` | 4d | — |
| 8.3 | **CRM screens** — Customer segments, communication, leads | `app/(staff)/crm/` | 5d | — |
| 8.4 | **Investment management (view only)** | `app/(client)/investments/` | 3d | — |
| 8.5 | **Dynamic report form viewer** | `components/dynamic-report-form.tsx` | 4d | — |

---

## 9. Implementation Tracker

### 9.1 Master Tracker

| Phase | ID | Task | Priority | Effort | Status | Dependencies | Target |
|-------|----|------|----------|--------|--------|-------------|--------|
| **P0** | 0.1 | Configure Sentry crash reporting | 🔴 CRITICAL | 2d | ❌ Not Started | — | Week 2 |
| **P0** | 0.2 | Enable push notifications (FCM + handler) | 🔴 CRITICAL | 3d | ❌ Not Started | — | Week 2 |
| **P0** | 0.3 | Replace console.log with logger | 🟡 HIGH | 1d | ❌ Not Started | — | Week 1 |
| **P0** | 0.4 | Add performance monitoring instrumentation | 🟡 HIGH | 1d | ❌ Not Started | — | Week 2 |
| **P0** | 0.5 | Write E2E offline → sync tests | 🔴 CRITICAL | 3d | ❌ Not Started | — | Week 2 |
| **P0** | 0.6 | Fix TypeScript strict mode errors | 🟡 HIGH | 2d | ❌ Not Started | — | Week 1 |
| **P1** | 1.1 | Wire origination/transition endpoint | 🟡 HIGH | 1d | ❌ Not Started | — | Week 3 |
| **P1** | 1.2 | Update app detail modal with workflow timeline | 🟡 HIGH | 3d | ❌ Not Started | 1.1 | Week 3 |
| **P1** | 1.3 | Update application store for workflow states | 🟡 HIGH | 2d | ❌ Not Started | 1.1 | Week 3 |
| **P1** | 1.4 | Update OriginationStatus types | 🟡 HIGH | 1d | ❌ Not Started | — | Week 3 |
| **P1** | 1.5 | Test full origination workflow | 🟡 HIGH | 2d | ❌ Not Started | 1.2-1.4 | Week 4 |
| **P2** | 2.1 | Build member allocation UI component | 🟡 HIGH | 3d | ❌ Not Started | — | Week 4 |
| **P2** | 2.2 | Integrate allocation into staff loan wizard | 🟡 HIGH | 3d | ❌ Not Started | 2.1 | Week 5 |
| **P2** | 2.3 | Add per-member pledgor collateral selector | 🟡 HIGH | 3d | ❌ Not Started | 2.2 | Week 5 |
| **P2** | 2.4 | Display group allocation read-only in detail | 🟡 HIGH | 2d | ❌ Not Started | — | Week 4 |
| **P2** | 2.5 | Wire validate-group-origination in wizard | 🟡 HIGH | 1d | ❌ Not Started | 2.2 | Week 5 |
| **P2** | 2.6 | Group aggregate view for client role | 🟢 MEDIUM | 2d | ❌ Not Started | — | Week 5 |
| **P3** | 3.1 | Collections store | 🟡 HIGH | 2d | ❌ Not Started | — | Week 6 |
| **P3** | 3.2 | Collections API wrappers | 🟡 HIGH | 2d | ❌ Not Started | 3.1 | Week 6 |
| **P3** | 3.3 | Collections dashboard screen | 🟡 HIGH | 3d | ❌ Not Started | 3.1-3.2 | Week 7 |
| **P3** | 3.4 | Collections case detail screen | 🟡 HIGH | 3d | ❌ Not Started | 3.3 | Week 7 |
| **P3** | 3.5 | Add collections tab to staff nav | 🟡 HIGH | 1d | ❌ Not Started | 3.3-3.4 | Week 7 |
| **P3** | 3.6 | Client creation screen | 🟡 HIGH | 3d | ❌ Not Started | — | Week 6 |
| **P3** | 3.7 | Client document management screen | 🟡 HIGH | 2d | ❌ Not Started | — | Week 6 |
| **P3** | 3.8 | Client collateral vault screen | 🟡 HIGH | 2d | ❌ Not Started | — | Week 7 |
| **P3** | 3.9 | Client branch transfer + staff assignment | 🟢 MEDIUM | 2d | ❌ Not Started | — | Week 7 |
| **P4** | 4.1 | Loan collateral management screen | 🟡 HIGH | 3d | ❌ Not Started | — | Week 8 |
| **P4** | 4.2 | Loan guarantor management screen | 🟡 HIGH | 3d | ❌ Not Started | — | Week 8 |
| **P4** | 4.3 | Penalty management screen | 🟢 MEDIUM | 2d | ❌ Not Started | — | Week 9 |
| **P4** | 4.4 | Waiver processing screen | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 9 |
| **P4** | 4.5 | Loan document upload + list | 🟡 HIGH | 2d | ❌ Not Started | — | Week 8 |
| **P4** | 4.6 | Workout request screen | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 9 |
| **P4** | 4.7 | Loan notes screen | 🟢 MEDIUM | 1d | ❌ Not Started | — | Week 8 |
| **P4** | 4.8 | Add tabs to loan detail layout | 🟡 HIGH | 2d | ❌ Not Started | 4.1-4.7 | Week 9 |
| **P5** | 5.1 | Savings store + API wrappers | 🟡 HIGH | 2d | ❌ Not Started | — | Week 10 |
| **P5** | 5.2 | Staff deposit screen | 🟡 HIGH | 3d | ❌ Not Started | 5.1 | Week 10 |
| **P5** | 5.3 | Staff withdrawal screen | 🟡 HIGH | 3d | ❌ Not Started | 5.1 | Week 10 |
| **P5** | 5.4 | TNM MPamba payment integration | 🟢 MEDIUM | 2d | ❌ Not Started | — | Week 11 |
| **P5** | 5.5 | Repayment reversal screen | 🟢 MEDIUM | 2d | ❌ Not Started | — | Week 11 |
| **P6** | 6.1 | Compliance store + API | 🟢 MEDIUM | 2d | ❌ Not Started | — | Week 11 |
| **P6** | 6.2 | KYC verification queue screen | 🟢 MEDIUM | 3d | ❌ Not Started | 6.1 | Week 12 |
| **P6** | 6.3 | KYC detail + verify screen | 🟢 MEDIUM | 3d | ❌ Not Started | 6.2 | Week 12 |
| **P6** | 6.4 | Operations officer dashboard | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 12 |
| **P6** | 6.5 | Disbursement processing screen | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 13 |
| **P6** | 6.6 | Accountant workspace screen | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 13 |
| **P7** | 7.1 | Portfolio dashboard | 🟢 MEDIUM | 4d | ❌ Not Started | — | Week 14 |
| **P7** | 7.2 | Portfolio risk analysis | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 14 |
| **P7** | 7.3 | Portfolio profitability | 🟢 MEDIUM | 3d | ❌ Not Started | — | Week 15 |
| **P7** | 7.4 | CIO dashboard | 🟢 MEDIUM | 4d | ❌ Not Started | — | Week 15 |
| **P7** | 7.5 | CEO/GCEO dashboards | 🔵 LOW | 4d | ❌ Not Started | — | Week 15 |
| **P8** | 8.1 | Staff messaging screens | 🔵 LOW | 5d | ❌ Not Started | — | Week 16 |
| **P8** | 8.2 | Audit workspace screens | 🔵 LOW | 4d | ❌ Not Started | — | Week 17 |
| **P8** | 8.3 | CRM screens | 🔵 LOW | 5d | ❌ Not Started | — | Week 17 |
| **P8** | 8.4 | Investment views (client) | 🔵 LOW | 3d | ❌ Not Started | — | Week 18 |
| **P8** | 8.5 | Dynamic report form viewer | 🔵 LOW | 4d | ❌ Not Started | — | Week 18 |

### 9.2 Priority Summary

```
🔴 CRITICAL (Week 1-2): 5 tasks (P0.1-P0.6)
🟡 HIGH (Week 3-10):    26 tasks (P1.1-P3.9, P4.1-P5.3)
🟢 MEDIUM (Week 8-15):  15 tasks (P4.3-P5.5, P6.1-P7.4)
🔵 LOW (Week 15-18):     5 tasks (P7.5-P8.5)
```

### 9.3 Dependency Graph

```
P0 (Prod Hardening) ───────► All subsequent phases
         │
P1 (Origination Workflow) ──► P3 (Collections) ──► P6 (Compliance & Ops)
         │
P2 (Group UX) ──────────────► P4 (Loan Mgmt) ────► P7 (Portfolio)
         │
P5 (Savings & Payments) ────► P8 (Advanced)
```

### 9.4 Key Milestones

| Milestone | Target | Deliverables |
|-----------|--------|-------------|
| M1: Production Stable | Week 2 | Sentry, push notifications, logger sweep, E2E tests pass |
| M2: Origination Parity | Week 5 | Full multi-stage workflow + group UC parity with web |
| M3: Collections Go-Live | Week 8 | Collections dashboard + case management |
| M4: Full Loan Management | Week 10 | Collateral, guarantors, penalties, waivers, docs, notes, workout |
| M5: Savings Go-Live | Week 11 | Staff deposit/withdrawal processing |
| M6: Compliance Go-Live | Week 13 | KYC verification queue |
| M7: Management Dashboards | Week 15 | Portfolio, risk, CIO, CEO views |
| M8: Advanced Features | Week 18 | Messaging, audit, CRM, investments |

---

## 10. Risk Assessment & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Backend API changes break mobile integration | MEDIUM | HIGH | Version API, use contract tests, coordinate release windows |
| Offline sync conflicts with concurrent web edits | MEDIUM | HIGH | Implement conflict detection (last-write-wins with audit), inform user |
| Group origination rules too complex for mobile UX | HIGH | MEDIUM | Simplify UI for initial release, add "advanced" expandable sections |
| Push notification delivery unreliable on Android | MEDIUM | MEDIUM | Implement fallback to in-app notification polling |
| FCM/APNs certificate management overhead | LOW | MEDIUM | Use Expo push notification service as abstraction |
| Performance degradation with many new screens | LOW | MEDIUM | Lazy load routes, paginate lists, use FlatList with memo |
| Team capacity insufficient for 18-week plan | MEDIUM | HIGH | Prioritize P0+P1, defer P6-P8 to phase 2 of project |

---

## Appendix A: File Inventory for New/Modified Files

### New Screens (to create)

```
app/(staff)/collections/
  _layout.tsx
  index.tsx                    # Collections dashboard
  [id].tsx                     # Collection case detail
app/(staff)/compliance/
  _layout.tsx
  kyc-queue.tsx               # KYC verification queue
  kyc/
    [id].tsx                   # KYC detail + verify
app/(staff)/operations/
  _layout.tsx
  index.tsx                    # Ops officer dashboard
  disbursements.tsx            # Disbursement processing
app/(staff)/accountant/
  _layout.tsx
  index.tsx                    # Accountant workspace
app/(staff)/portfolio/
  _layout.tsx
  index.tsx                    # Portfolio dashboard
  risk.tsx                     # Risk analysis
  profitability.tsx            # Profitability
app/(staff)/cio/
  _layout.tsx
  index.tsx                    # CIO dashboard
app/(staff)/ceo/
  _layout.tsx
  index.tsx                    # CEO dashboard
app/(staff)/gceo/
  _layout.tsx
  index.tsx                    # GCEO dashboard
app/(staff)/messaging/
  _layout.tsx
  index.tsx                    # Conversation list
  [id].tsx                     # Chat view
app/(staff)/audit/
  _layout.tsx
  index.tsx                    # Audit workspace
app/(staff)/crm/
  _layout.tsx
  index.tsx                    # CRM dashboard
app/(staff)/clients/
  create.tsx                   # Create client
  [id]/
    documents.tsx              # Client document management
    collateral-vault.tsx       # Client collateral vault
app/(staff)/loans/[id]/
  collateral.tsx               # Loan collateral
  guarantors.tsx               # Loan guarantors
  penalties.tsx                # Penalty management
  waivers.tsx                  # Waiver processing
  documents.tsx                # Loan documents
  workout.tsx                  # Loan workout
  notes.tsx                    # Loan notes
app/(staff)/savings/
  _layout.tsx
  deposit.tsx                  # Record deposit
  withdrawal.tsx               # Process withdrawal
app/(client)/investments/
  _layout.tsx
  index.tsx                    # Investment overview
```

### New Components (to create)

```
components/
  group-allocation-editor.tsx       # Member allocation input (Phase 2)
  collection-case-card.tsx          # Collection case summary card
  workflow-timeline.tsx             # Origination stage timeline (Phase 1)
  dynamic-report-form.tsx           # JSON-schema form renderer (Phase 8)
  kyc-document-viewer.tsx           # KYC document preview
  portfolio-summary-card.tsx        # Portfolio metric card
```

### New Stores (to create)

```
store/
  collections.ts              # Collections state
  compliance.ts               # Compliance state  
  savings.ts                  # Savings deposits/withdrawals
  portfolio.ts                # Portfolio analytics
  messaging.ts                # Staff messaging
```

### New Lib Modules (to create)

```
lib/data/
  collections-api.ts          # Collections API wrappers
  compliance-api.ts           # Compliance API wrappers
  savings-api.ts              # Savings API wrappers
  portfolio-api.ts            # Portfolio API wrappers
  messaging-api.ts            # Messaging API wrappers
```

### Existing Files to Modify

```
lib/config.ts                 # Add new endpoint paths
lib/data/api.ts               # Add new API wrappers
lib/data/types.ts             # Update OriginationStatus, add new types
lib/production-init.ts        # Add Sentry init
lib/notifications.ts          # Complete push handler
app/_layout.tsx               # Push notification setup
app/(staff)/_layout.tsx       # Add collections, compliance, savings, portfolio tabs
app/(staff)/applications/[id].tsx  # Workflow timeline integration
components/application-detail-modal.tsx  # Workflow actions
components/staff-loan-application-modal.tsx  # Group allocation UI
components/record-payment-modal.tsx  # Repayment reversal
store/applications.ts         # Workflow states
package.json                  # Add @sentry/react-native
```

---

*This document was generated based on deep scan of both `loanmanagementapp` and `cofi-bms-api` repositories, analysis of `PRODUCTION_UPGRADES.md` (305 lines), `MOBILE_APP_LOAN_MANAGEMENT_UPGRADE_GUIDE.md` (262 lines), `IMPLEMENTATION_VERIFICATION.md` (283 lines), and 4 other documentation files totaling 1,508+ lines of analysis.*
