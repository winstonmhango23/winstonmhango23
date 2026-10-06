# Loan Management Mobile App – Implementation Plan

## Executive Summary

The **loanmanagementapp** is a React Native Expo app for **Clients** and **Loan Officers**. It enables:

- **Clients:** Apply for loans, track application status, monitor repayments, view schedules, receive notifications
- **Loan Officers:** Process applications, track origination, view digest/due today/overdue, process payments, receive in-app alerts

This document provides a phased implementation plan based on the current codebase scan and backend API availability.

---

## 0. Design & Theme (Premium, Professional)

The app uses the **CoFi Banking Design System**, matching the dashboard for consistent brand identity. All screens must follow these guidelines.

### 0.1 Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| **Primary** | `#0a3d7a` (navy) | `#e6b800` (gold) | Buttons, links, active states |
| **Accent** | `#e6b800` (gold) | `#e6b800` | Highlights, CTAs, tab bar |
| **Background** | `#f8f9fb` | `#05080f` | Screen background |
| **Card** | `#ffffff` | `#061528` | Cards, surfaces |
| **Success** | `#22c55e` | - | Approved, paid |
| **Warning** | `#f59e0b` | - | Pending, overdue |
| **Destructive** | `#ef4444` | - | Rejected, failed |

### 0.2 Typography

- **Fonts:** Inter (body), Poppins (headings) – match dashboard. Load via `expo-font` + `@expo-google-fonts/inter`, `@expo-google-fonts/poppins`
- **Headings:** Bold, clear hierarchy (title > subtitle > body)
- **Body:** Readable line height (1.5), adequate contrast
- **Numbers/amounts:** Monospace or tabular figures for alignment (e.g. MK 45,000.00)

### 0.3 Components

- **Cards:** White/dark surface, subtle shadow (`Shadows.card`), `Radius.md` (10px)
- **Buttons:** Primary = navy fill; Secondary = outline; Accent = gold for key actions
- **Status badges:** Use `StatusColors` (approved=green, pending=amber, rejected=red, disbursed=teal)
- **Tab bar:** Navy icons when selected; gold accent for active state in dark mode

### 0.4 Backgrounds & Surfaces

- **Screen background:** Soft gradient or solid `background` color – avoid flat white
- **Cards:** Elevated with `Shadows.card`; optional subtle border
- **Premium feel:** Use `Shadows.cardGold` sparingly for hero/featured cards (e.g. loan summary)
- **Glass effect:** Optional for headers – `backdrop-filter` equivalent where supported

### 0.5 Implementation

Theme constants are in `constants/theme.ts`:
- `Colors` – light/dark palette
- `CoFiColors` – raw palette
- `Spacing`, `Radius`, `Shadows`, `StatusColors`

All new screens and components must use these tokens. Avoid hardcoded hex values.

---

## 1. Current State

### 1.1 Mobile App (loanmanagementapp)

| Aspect | Status |
|--------|--------|
| **Stack** | React Native Expo 54, Expo Router 6, TypeScript |
| **Structure** | Blank template with 2 tabs: Home, Explore |
| **Auth** | None |
| **API** | No API integration |
| **State** | No global state (no Zustand/Context for auth) |

**Key files:**
- `app/_layout.tsx` – Root layout, Stack + tabs
- `app/(tabs)/_layout.tsx` – Tab navigator (Home, Explore)
- `app/(tabs)/index.tsx` – Home (placeholder)
- `app/(tabs)/explore.tsx` – Explore (placeholder)
- `constants/theme.ts` – Colors, fonts
- `components/` – ThemedText, ThemedView, ParallaxScrollView, etc.

### 1.2 Backend API (cofi-bms-api)

**Available endpoints:**

| Area | Endpoint | Auth | Notes |
|------|----------|------|-------|
| **Staff auth** | `POST /api/v1/auth/login` | - | Returns JWT |
| **Client auth** | `POST /api/v1/client/client-auth/login` | - | Email + password, returns JWT |
| **Client auth** | `POST /api/v1/client/client-auth/register` | - | Self-service registration |
| **Client auth** | `POST /api/v1/client/client-auth/token` | - | JSON body login |
| **Loan applications** | `POST /api/v1/loans/apply` | Client | Self-service apply |
| **Loan applications** | `GET /api/v1/loans/my-applications` | Client | Client's applications |
| **Loan applications** | `GET /api/v1/loans/applications` | Staff | List all (filterable) |
| **Loan applications** | `PUT /api/v1/loans/applications/{id}` | Staff | Update status |
| **Loan applications** | `POST /api/v1/loans/applications/{id}/approve` | Staff | Approve |
| **Loan applications** | `POST /api/v1/loans/applications/{id}/create-loan` | Staff | Disburse |
| **Loans** | `GET /api/v1/loans/my-loans` | Client | Client's loans |
| **Loans** | `GET /api/v1/loans/{id}/schedule` | Staff | Repayment schedule |
| **Loans** | `GET /api/v1/loans/{id}/repayments` | Staff | Repayment history |
| **Repayments** | `GET /api/v1/repayments/due-today` | Staff | For hub |
| **Repayments** | `GET /api/v1/repayments/overdue` | Staff | For hub |
| **Repayments** | `GET /api/v1/repayments/upcoming` | Staff | For hub |
| **Staff digest** | `GET /api/v1/staff/digest` | Staff | Daily digest |
| **Staff notifications** | `GET /api/v1/staff/notifications` | Staff | In-app |
| **Customer portal** | `GET /api/v1/customer/payment-schedules` | Client | Payment schedules |
| **Customer portal** | `GET /api/v1/customer/payment-schedules/upcoming` | Client | Upcoming |
| **Customer portal** | `GET /api/v1/customer/dashboard` | Client | Overview |
| **Customer portal** | `POST /api/v1/customer/loan-applications` | Client | Apply (alt) |
| **Repayment reminders** | `GET/PUT /repayment-reminders/clients/{id}/notification-preferences` | Staff | Needs client self-service |

### 1.3 Gaps for Mobile

| Gap | Description |
|-----|-------------|
| **Client loan schedule** | `GET /loans/{id}/schedule` requires staff. Client needs own loan schedule – use `/customer/payment-schedules` or add client-scoped endpoint |
| **Client repayment history** | `GET /loans/{id}/repayments` requires staff. Need client-scoped endpoint or customer portal equivalent |
| **Client notification prefs** | `GET/PUT .../clients/{id}/notification-preferences` requires `client:read`/`client:write`. Need self-service: `GET/PUT /repayment-reminders/my/notification-preferences` |
| **Push token registration** | No endpoint. Add `POST /api/v1/device/push-token` for FCM token |
| **Loan products (public)** | Client needs to list products when applying – check if public or staff-only |

---

## 2. User Flows

### 2.1 Client Flows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLIENT JOURNEY                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Login/Register] → [Dashboard] → [Apply for Loan] → [Track Application]   │
│        │                  │              │                    │             │
│        │                  │              │                    └─ Status:    │
│        │                  │              │                       DRAFT,     │
│        │                  │              │                       SUBMITTED,  │
│        │                  │              │                       PENDING_REVIEW,│
│        │                  │              │                       UNDER_REVIEW,│
│        │                  │              │                       APPROVED,   │
│        │                  │              │                       REJECTED,   │
│        │                  │              │                       DISBURSED   │
│        │                  │              │                                 │
│        │                  │              └─ Product, amount, term            │
│        │                  │                                 │              │
│        │                  └─ My Loans │ My Applications │   │              │
│        │                               │ Repayment Summary │   │              │
│        │                               │ Notifications     │   │              │
│        │                                                                    │
│        └─ [Repayment Schedule] [Payment History] [Notification Settings]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Loan Officer Flows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LOAN OFFICER JOURNEY                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Login] → [Dashboard / Digest] → [Applications Queue] → [Process]         │
│      │              │                    │                    │             │
│      │              │                    │                    └─ Review,   │
│      │              │                    │                       Approve,   │
│      │              │                    │                       Reject,    │
│      │              │                    │                       Disburse   │
│      │              │                    │                                 │
│      │              │                    └─ Filter by status, branch       │
│      │              │                                                       │
│      │              └─ Due Today │ Overdue │ Upcoming │ Notifications      │
│      │                                                                     │
│      └─ [Process Payment] [View Loan Details] [Repayment Hub]             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture

### 3.1 API Strategy

**Option A: Direct backend** (recommended for mobile)
- Mobile calls `cofi-bms-api` directly
- No CORS issues on native
- Single source of truth
- Config: `API_BASE_URL` (e.g. `https://cofi-bms-api.up.railway.app`)

**Option B: Via BFF**
- Mobile calls `cofi-bms-dashboard` API routes
- Adds latency, more moving parts
- Use only if BFF adds value (e.g. aggregation, caching)

**Recommendation:** Direct backend. Add `lib/api-client.ts` with base URL, auth header injection, error handling.

### 3.2 Auth Strategy

- **Staff:** JWT from `POST /auth/login` (username/password)
- **Client:** JWT from `POST /client/client-auth/token` (email/password)
- **Storage:** `expo-secure-store` for token
- **Context:** `AuthContext` with `user`, `role`, `token`, `login`, `logout`

### 3.3 Role-Based Navigation

```
App Entry
    │
    ├─ [Not logged in] → (auth) → Login / Register
    │
    └─ [Logged in]
           │
           ├─ role === 'CLIENT' → (client) tabs
           │       ├─ Home (Dashboard)
           │       ├─ Applications
           │       ├─ Loans
           │       ├─ Repayments
           │       └─ Profile (Notifications, Settings)
           │
           └─ role === 'LOAN_OFFICER' | 'MANAGER' | etc. → (staff) tabs
                   ├─ Digest / Home
                   ├─ Applications
                   ├─ Repayments (Due Today, Overdue, Upcoming)
                   ├─ Notifications
                   └─ Profile
```

---

## 4. Implementation Phases

### Phase 1: Foundation (Weeks 1–2)

| Task | Deliverable |
|------|-------------|
| API client | `lib/api-client.ts` – fetch wrapper, base URL, auth header |
| Auth context | `contexts/AuthContext.tsx` – login, logout, token, user |
| Secure storage | `expo-secure-store` for token |
| Auth screens | Login (staff + client), Register (client) |
| Role-based layout | Redirect to `(client)` or `(staff)` based on role |
| Env config | `API_BASE_URL` in app config / env |

**File structure:**
```
app/
  _layout.tsx          # AuthProvider, initial route
  (auth)/
    login.tsx
    register.tsx
  (client)/
    _layout.tsx        # Client tabs
    (tabs)/
      index.tsx        # Dashboard
      applications.tsx
      loans.tsx
      repayments.tsx
      profile.tsx
  (staff)/
    _layout.tsx        # Staff tabs
    (tabs)/
      index.tsx        # Digest
      applications.tsx
      repayments.tsx
      notifications.tsx
      profile.tsx
lib/
  api-client.ts
contexts/
  AuthContext.tsx
```

---

### Phase 2: Client – Loan Applications (Weeks 3–4)

| Task | Deliverable |
|------|-------------|
| Apply for loan | Form: product, amount, term; call `POST /loans/apply` |
| My applications | List from `GET /loans/my-applications` |
| Application detail | Status, timeline, notes (if API supports) |
| Application status labels | DRAFT, SUBMITTED, PENDING_REVIEW, UNDER_REVIEW, APPROVED, REJECTED, DISBURSED |

**Backend check:** Ensure `GET /loans/products` or equivalent is accessible for product list when applying. If staff-only, add `GET /loans/products/public` or include in apply flow.

---

### Phase 3: Client – Loans & Repayments (Weeks 5–6)

| Task | Deliverable |
|------|-------------|
| My loans | List from `GET /loans/my-loans` |
| Loan detail | Summary, outstanding, next due |
| Repayment schedule | Use `/customer/payment-schedules` or add `GET /loans/my-loans/{id}/schedule` (client-scoped) |
| Payment history | Use customer portal or add client-scoped repayments endpoint |

**Backend work (if needed):**
- Add `GET /loans/{id}/schedule` with `get_current_active_client` – allow if `loan.client_id == current_client.id`
- Add `GET /loans/{id}/repayments` with client auth – same check

---

### Phase 4: Loan Officer – Applications & Repayments (Weeks 7–8)

| Task | Deliverable |
|------|-------------|
| Applications queue | List from `GET /loans/applications` with filters |
| Application detail | Full view, approve/reject actions |
| Disburse | Call `POST /loans/applications/{id}/create-loan` |
| Due today | `GET /repayments/due-today` |
| Overdue | `GET /repayments/overdue` |
| Upcoming | `GET /repayments/upcoming` |
| Process payment | Call `POST /loans/repayments` (if teller permission) |

---

### Phase 5: Staff Digest & Notifications (Week 9)

| Task | Deliverable |
|------|-------------|
| Daily digest | `GET /staff/digest` – cards for due today, overdue, upcoming |
| In-app notifications | `GET /staff/notifications`, mark read |
| Notification bell | Badge count from `GET /staff/notifications/unread-count` |

---

### Phase 6: Client Notifications & Push (Weeks 10–11)

| Task | Deliverable |
|------|-------------|
| Notification preferences | GET/PUT own prefs – **Backend:** add `GET/PUT /repayment-reminders/my/notification-preferences` (client auth) |
| Push token registration | **Backend:** add `POST /device/push-token` |
| FCM setup | `expo-notifications`, Firebase config |
| Push handling | Foreground/background notification display |

**Backend additions:**
- `GET /repayment-reminders/my/notification-preferences` – client auth, returns prefs for `current_client.id`
- `PUT /repayment-reminders/my/notification-preferences` – client auth
- `POST /device/push-token` – body: `{ "token": "...", "platform": "ios"|"android" }`, store in `device_registrations` or `staff`/`clients` table

---

### Phase 7: Polish & Offline (Weeks 12–13)

| Task | Deliverable |
|------|-------------|
| Error handling | Network errors, 401 redirect to login |
| Loading states | Skeletons, pull-to-refresh |
| Offline | Cache key screens (e.g. loans list) with AsyncStorage; show stale with banner |
| Deep linking | `loanmanagementapp://loan/123` for notifications |

---

## 5. Backend Additions Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/repayment-reminders/my/notification-preferences` | GET | Client | Get own prefs |
| `/repayment-reminders/my/notification-preferences` | PUT | Client | Update own prefs |
| `/loans/{id}/schedule` | GET | Client OR Staff | Allow client if `loan.client_id == current_client.id` |
| `/loans/{id}/repayments` | GET | Client OR Staff | Same as above |
| `/device/push-token` | POST | Client OR Staff | Register FCM token |

**Alternative:** Use customer portal `payment-schedules` for client schedule if it already returns loan-level data. Verify schema.

---

## 6. Dependencies to Add

```json
{
  "expo-secure-store": "~14.0.0",
  "expo-notifications": "~0.29.0",
  "@react-native-async-storage/async-storage": "1.23.0",
  "expo-font": "~14.0.0",
  "@expo-google-fonts/inter": "^0.2.3",
  "@expo-google-fonts/poppins": "^0.2.3"
}
```

For FCM (push): Follow Expo push notification setup. May need `expo-device`, `expo-constants` for token.

---

## 7. Loan Application Status Reference

| Status | Description |
|--------|-------------|
| DRAFT | Not yet submitted |
| SUBMITTED | Submitted, awaiting review |
| PENDING_REVIEW | In queue for review |
| UNDER_REVIEW | Being reviewed |
| APPROVED | Approved, pending disbursement |
| REJECTED | Rejected |
| DISBURSED | Loan created and disbursed |
| ACTIVE | Loan is active |
| DELINQUENT | Overdue |
| DEFAULTED | In default |
| CLOSED | Paid off |
| WRITTEN_OFF | Written off |

---

## 8. File Checklist

### Design Components (use across all phases)
- [ ] `constants/theme.ts` – CoFi design system (✅ done)
- [ ] `components/ui/banking-card.tsx` – Premium card (✅ done)
- [ ] `components/ui/status-badge.tsx` – Status pills (approved, pending, etc.)
- [ ] `components/ui/amount-text.tsx` – Formatted MK amounts

### Phase 1
- [ ] `lib/api-client.ts`
- [ ] `contexts/AuthContext.tsx`
- [ ] `app/(auth)/login.tsx`
- [ ] `app/(auth)/register.tsx`
- [ ] `app/(client)/_layout.tsx`
- [ ] `app/(client)/(tabs)/_layout.tsx`
- [ ] `app/(staff)/_layout.tsx`
- [ ] `app/(staff)/(tabs)/_layout.tsx`
- [ ] `app/_layout.tsx` (updated)

### Phase 2–7
- [ ] Client: applications list, apply form, application detail
- [ ] Client: loans list, loan detail, schedule, repayments
- [ ] Staff: applications queue, application detail, approve/reject/disburse
- [ ] Staff: repayments (due today, overdue, upcoming), process payment
- [ ] Staff: digest, notifications
- [ ] Client: notification preferences, push registration
- [ ] Shared: profile, logout

---

## 9. Success Criteria

| Metric | Target |
|--------|--------|
| Client can apply for loan | ✓ |
| Client can track application status | ✓ |
| Client can view repayment schedule | ✓ |
| Client can view payment history | ✓ |
| Loan officer can process applications | ✓ |
| Loan officer can view digest & repayments | ✓ |
| Loan officer can process payments | ✓ |
| Push notifications received | ✓ |
| App works offline for cached data | ✓ |

---

*Document version: 1.0 | Created: Feb 2025*
