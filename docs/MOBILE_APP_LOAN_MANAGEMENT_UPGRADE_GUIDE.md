# Mobile app (loanmanagementapp) — loan management parity with web BMS

This document captures how the **Expo mobile app** (`loanmanagementapp/`) works today, how the **web BMS** (`cofi-bms-dashboard/`) and **API** (`cofi-bms-api/`) handle **individual vs group** loan origination, and a **prioritized implementation plan** to close gaps so loan officers can perform **group-related operations on mobile** at parity with web.

---

## Staff LO alignment (field ops)

Branch: `feat/mobile-lo-staff-alignment`. Scope is **Loan Officer daily field work** — not full staff↔web parity.

### P0 (must be green)

| Area | Mobile fix |
|------|------------|
| Repayment reverse | `POST /repayments/{id}/reverse` (requires `loan:approve`) |
| Repayment search | `GET /repayments/portfolio-history?search=` |
| Repayment hub | Tabs wired to `due-today` / `overdue` / `upcoming` + recorded history |
| Collections | Paths aligned to `/collections/delinquency-buckets`, `/dashboard/summary`, `/case/{id}/activities`, `POST /activities`, resolve/assign |
| Digest | `GET /staff/digest` KPIs with local loan/app counts as fallback |
| Permissions | `GET /permissions/me` after staff hydrate — gates reverse, collect, collections actions |

### P1

- Disbursement CTA honesty (web BMS: Accountant → Ops Assistant → CEO); no fake local disburse
- Client/loan documents: `expo-document-picker` + `/media/upload` then document create
- Push tap navigates to loan/notification deep link
- Stub retirement: messaging / audit / notification-settings → desktop-only notice; CEO/CIO/Ops/Accountant shells role-gated

### Desktop-only (do not port)

Disbursement reviewer, CEO release, Loan Kill Box, zone/district admin, GL/outbox, full Airtel treasury console, waiver dual-control approve queue, real `/messaging` product, audit API console.

### Manual LO UAT (Railway / EAS — no local FastAPI)

1. Staff login → Digest shows due-today / overdue from backend digest (or local fallback)
2. Applications: LO `SUBMIT_TO_CIO` / `LO_RETURN_TO_CLIENT` only
3. Clients: create, group members/leaders, KYC review
4. Loans: schedule, penalties, waiver **request**, notes
5. Repayments: Due today / Overdue / Upcoming tabs populate; record payment shows pending ops; reverse only if `loan:approve`
6. Collections: list + case activity + resolve/assign (if `collection:update`)
7. Notifications + push tap (production build, not Expo Go)
8. Offline banner + Sync Center retry
9. Airtel/TNM collect hidden or blocked without `airtel:collect` / `tnm:collect`

**Product context**

- **loanmanagementapp**: native app for **loan officers** and **borrowers** (staff + client roles in one codebase).
- **Web BMS**: authoritative **staff** experience; loan officer workflows are **current** here.
- **Web client portal** (`/client-portal`): **browser-only** borrower UI; **not** a replacement for the mobile borrower experience, but it shares the same backend client JWT and `/mobile/*` / `/customer/*` routes.

---

## 1. Current mobile app implementation

### 1.1 Stack and entry points

| Area | Location |
|------|----------|
| Staff shell | `app/(staff)/` — dashboard, applications, loans, repayments, clients, notifications |
| Client shell | `app/(client)/` — loans, applications, repayments, profile |
| Auth | `store/auth.ts` — staff JWT vs client JWT; `isGroupAdmin` surfaced from stored user |
| API layer | `lib/data/api.ts` — direct `fetch`/`api` client to `EXPO_PUBLIC_API_URL` (default `…/api/v1`) |
| Offline | `lib/data/index.ts` — SQLite + `lib/sync/sync-service.ts` queue (`CREATE_APPLICATION`, etc.) |

### 1.2 Loan officer — clients

- **List**: `GET /clients/?limit=&skip=&…` via `apiGetClients` / `apiGetClientsPaginated` (`lib/data/api.ts`).
- **No query flags** today for `exclude_group_members`, `all_branch_clients`, `assigned_to_me` combinations as rich as web (web uses CIO/ops-specific tabs and filters).
- **Create client**: `POST /clients/` with `client_type` `INDIVIDUAL` \| `SME` \| `COOPERATIVE` (`apiCreateClient`). Optional **business location** for SME/cooperative via `apiSetClientBusinessLocation`.
- **Missing from type union**: web/backend also use **`GROUP`** parent type; mobile typings often omit `GROUP` even if API accepts it — align with `GROUP_PARENT_CLIENT_TYPES` on API.
- **Client detail** (`app/(staff)/clients/[id].tsx`): KYC-style edit (name, phone, ID, photos, verify). **No** “group members”, “group leaders”, or “group loan aggregate” surfaces.

### 1.3 Loan officer — loan origination (applications)

- **Create draft (staff)**: `apiCreateApplicationStaff` → `POST /loans/applications` with body:

  ```json
  {
    "client_id", "loan_product_id", "branch_id",
    "requested_amount", "requested_term_months", "purpose", "status": "DRAFT"
  }
  ```

- **Not sent today**: `group_loan_allocation` (member split), any **group parent** validation, or **pre-flight** validate-group call.
- **Wizard UI**: `components/staff-loan-application-modal.tsx` — steps Client → Product → Amount/purpose → Review; optional **business location** GPS for business flows. **No** branch for “group parent borrower”, **no** member picker, **no** equal/custom split UI.
- **After draft**: `components/application-detail-modal.tsx` — origination checklist from `GET /loans/applications/{id}/origination-status`, collateral/guarantors/docs, submit/approve/reject/disburse. Collateral add uses `apiAddApplicationCollateral` **without** `pledgor_client_id` (see web/API gap below).

### 1.4 Sync pipeline

- `CREATE_APPLICATION` in `lib/sync/sync-service.ts` calls `apiCreateApplicationStaff`, then optional documents and `apiSetApplicationBusinessLocation`.
- **No** post-create PATCH for `group_loan_allocation`, **no** validate-group step.

### 1.5 Borrower (client role) in mobile

- Applications via **customer** self-service (`config.customer.loanApplications`) and/or `loans/apply` patterns in `apiCreateApplicationClient`.
- **Repayments**: `RecordPaymentModal`, customer repayments list — aligned with client APIs.
- **Group chair** flags exist in auth store (`isGroupAdmin`) but **no** dedicated screens for **member credential provisioning** (`GET/PUT /mobile/group/members…`) — those were added for web client portal; mobile borrower app should reuse same endpoints where product requires chairs to onboard members.

---

## 2. Web BMS + API — loan origination (reference behavior)

### 2.1 Individual borrower

- Staff selects an **individual** client (or non–group-parent client), product, amount, term → `POST /loans/applications` (via BFF) with standard `LoanApplicationCreate`.
- Origination status drives collateral/guarantors/documents → submit → CIO pipeline (`loan_origination_cycle_service`, transitions on `…/origination/transition`, etc.) — web **LoanApplicationManagement** / detail views expose this.

### 2.2 Group parent (GROUP / COOPERATIVE / SME)

Backend treats **group parent** `Client` rows as borrowers for **group loans** when `client_type ∈ {GROUP, COOPERATIVE, SME}` and `parent_client_id` is null (`group_loan_allocation_service.is_group_parent_client`).

**Rules already enforced on API (web relies on these):**

1. **Active members required** before creating an application on a group parent: `LoanApplicationService.create_loan_application` rejects if `list_group_member_client_ids` is empty.
2. **`group_loan_allocation`**: JSON on `LoanApplication` storing per-member principal split (and related validation). Normalized on create/update in `loan_service` / allocation helpers.
3. **Pre-validation**: `POST /loans/applications/validate-group-origination` (`loans.py`) — preview collateral requirements / split before draft (web `LoanApplicationForm` calls BFF `validate-group-origination`).
4. **Origination status** (`GET …/origination-status`): includes **group-specific** readiness (e.g. members missing collateral for booking, `next_step` values such as group collateral / pledgor flows) — see `loan_origination_readiness` + `members_missing_collateral_for_booking` in `loans.py`.
5. **Collateral**: `pledgor_client_id` on `loan_collaterals` for group pledgor tagging (migration `inv2026041101`); booking paths validate per-member collateral coverage.
6. **Clients module (web only today)**:
   - `GET/POST /clients/{groupId}/members` — add/list **group members** (`require_group_member_add_access` / branch checks).
   - `GET/PUT/POST/PATCH/DELETE …/leaders` — **group leaders**, permissions including `provision_member_credentials`, `update_repayments`, etc.
   - Group loan aggregate: `GET /clients/{id}/group-loan-aggregate`.

### 2.3 Staff permissions (web)

- Group member add: extended beyond LO/CIO/PM to **operations officer / ops manager** (`auth_service.require_group_member_add_access` + dashboard `canAddGroupMembers`).
- Leader management: `client:update` + branch alignment.

---

## 3. Parity matrix (web LO vs mobile LO)

| Capability | Web BMS | Mobile loanmanagementapp |
|------------|---------|----------------------------|
| Client list with search / pagination | Yes (`ClientsPage`, filters, CIO/ops tabs) | Partial (paginated search; **no** same tab/filter model) |
| Exclude / include group members in lists | Yes (`exclude_group_members`, `all_branch_clients`, etc.) | **Gap** — API supports flags; mobile does not pass them consistently |
| Create **individual** client | Yes | Yes |
| Create **SME / COOPERATIVE** (+ business location) | Yes | Yes |
| Create **GROUP** parent type explicitly | Yes | **Gap** — typings / UI often `COOPERATIVE` only |
| **List / add group members** | Yes (`/clients/{id}/members`, `GroupMemberFormModal`) | **Missing** — no API wrappers or screens |
| **Group leaders + permissions** | Yes (`/clients/{id}/leaders`) | **Missing** |
| **Group loan aggregate** on client | Shown in client context | **Missing** |
| New application: select **group parent** as borrower | Yes | Partial — can pick any client id if in list, **no** UX guardrails |
| New application: **member allocation** (equal/custom) | Yes (`LoanApplicationForm`, validate-group) | **Missing** |
| Persist `group_loan_allocation` on create / update | Yes | **Missing** |
| Pre-flight **validate-group-origination** | Yes | **Missing** |
| Origination status **next_step** for group collateral | Yes (management UI) | **Partial** — mobile `OriginationStatus` type is a **narrow** union; backend may return additional steps |
| Collateral **pledgor** per member | Yes (loan application management / forms) | **Gap** — `apiAddApplicationCollateral` body has no `pledgor_client_id` |
| Empty-group / zero-member guard UX | Yes (alerts, links to members) | **Missing** |
| Member **credential provisioning** (chair / parent / delegated) | Web client portal + `PUT /mobile/group/members/{id}/credentials` | **Missing** in staff app; **optional** for client role in mobile |
| Loan origination **stage transitions** (CIO/PM/CEO/GCEO/ops) | Full `LoanApplicationManagement` | **Gap** — mobile uses approve/reject/disburse shortcuts; may not match unified origination transition rules |

---

## 4. Gap list (detailed)

### G4.1 — API client (`lib/data/api.ts`) surface

- Add typed helpers mirroring web/BFF:
  - `GET/POST /clients/{groupId}/members` (list + `GroupMemberCreate`).
  - `GET/PUT/POST/PATCH/DELETE /clients/{groupId}/leaders…` (slot, custom, patch, delete).
  - `GET /clients/{groupId}/group-loan-aggregate`.
  - `POST /loans/applications/validate-group-origination`.
  - `PATCH /loans/applications/{id}` (or existing update) to send **`group_loan_allocation`** when product is group-eligible.
- Extend `apiAddApplicationCollateral` to accept **`pledgor_client_id`** when API expects it.
- Pass **`exclude_group_members`** (and other list flags) from clients screens to match web defaults for LO “top-level” client pickers.

### G4.2 — Data model in mobile UI stores

- Extend `ClientRow` / `Client` / `ApiClient` with: `client_type`, `parent_client_id`, `member_count` (if API returns on parent), `is_group_admin`, `group_role` where needed for picker labels and guards.

### G4.3 — Staff UX: client detail / group hub

- For clients where `client_type` is group parent:
  - Tab or stack screens: **Members** (list, add member form), **Leaders**, **Summary** (aggregate).
  - Reuse patterns from web: deep link to members, “add member before loan” copy.
- **Add member** flow: collect same fields as `GroupMemberCreate` (password, KYC subset) + call `POST …/members`.

### G4.4 — Staff UX: loan origination wizard

- When selected borrower is **group parent**:
  - Fetch **members** (`GET …/members`); block Next until count ≥ 1 (mirror API error).
  - Step: **Allocation** — equal split / custom amounts; total must match requested principal (same rules as web).
  - Call **validate-group-origination** before `POST` (or immediately after draft creation if web does two-phase — match web `LoanApplicationForm` order).
  - Include `group_loan_allocation` in `POST /loans/applications` body (shape from `LoanApplicationCreate` / web types `lms.ts`).
- If product requires collateral and group split: after draft, guide user through **per-member pledgor** collateral — align with web `LoanApplicationManagement` / origination-status messaging.

### G4.5 — Application detail modal

- Parse **full** origination payload from API (don’t assume `next_step` is only `collateral` \| `guarantor` \| …). Add UI branches for **group-specific** steps returned by backend.
- When adding collateral, show **member (pledgor)** selector for group applications.
- Surface **group_loan_allocation** read-only summary for context.

### G4.6 — Offline / sync

- Extend `CREATE_APPLICATION` payload to include `group_loan_allocation` when present.
- Define behavior when offline: block group application creation, or queue with clear “cannot sync until valid” rules (recommended: **require online** for group parent applications to avoid partial state).

### G4.7 — Client (borrower) role in mobile

- Optional: **Member logins** screen for chairs/parents calling:
  - `GET /mobile/me/session`
  - `GET /mobile/group/members`
  - `PUT /mobile/group/members/{id}/credentials`
- Align with web client portal semantics; reuse strings and validation (min password length, email uniqueness errors).

### G4.8 — GROUP client type

- Add `GROUP` to all `client_type` unions and create-client pickers where backend supports it.

### G4.9 — Testing / QA

- Matrix: INDIVIDUAL vs COOPERATIVE vs GROUP parent; with 0, 1, N members; with/without collateral required; with pledgor rules; submit → approve → disburse multi-loan booking.

---

## 5. Implementation plan (phased)

### Phase A — API parity in mobile client (low risk)

1. **`lib/config.ts`**  
   - Optional: centralize path fragments for `clients`, `loans`, `validate-group-origination` (or keep relative paths in `api.ts`).

2. **`lib/data/api.ts`**  
   - Implement wrappers listed in **G4.1**.  
   - Update `apiCreateApplicationStaff` to accept optional `group_loan_allocation: Record<string, unknown>` (typed struct preferred — mirror `cofi-bms-dashboard/types/lms.ts`).  
   - Update collateral POST body to include optional `pledgor_client_id`.

3. **Types**  
   - Add `types/group-loan.ts` (or extend `lib/data/types.ts`) mirroring web’s `GroupOriginationValidateRequest/Response` and allocation shape.

### Phase B — Group client hub (staff)

1. **`app/(staff)/clients/[id].tsx` or new route `clients/[id]/members.tsx`**  
   - Detect group parent (`client_type` + no `parent_client_id`).  
   - Members list + navigate to add-member form.  
   - Link to **Leaders** screen (new route).

2. **New screens**  
   - `GroupMemberFormScreen` — POST members.  
   - `GroupLeadersScreen` — read-only list + staff-only note that permission edits are web-only **or** full CRUD via new API calls (prefer parity: **full CRUD on mobile**).

3. **`apiGetClients` for picker**  
   - Use `exclude_group_members=true` for LO “borrower picker” in loan wizard unless explicitly including members.

### Phase C — Loan origination wizard (group branch)

1. **`staff-loan-application-modal.tsx`**  
   - After client selection, if group parent → fetch members; show allocation UI; call validate-group; merge into submit payload.

2. **`store/applications.ts` / `lib/data/index.ts` / `sync-service.ts`**  
   - Thread `group_loan_allocation` through `CreateApplicationInput` and sync payload.

3. **`application-detail-modal.tsx`**  
   - Extend origination handling and collateral form (pledgor).

### Phase D — Borrower (client) enhancements

1. If product requires chairs to onboard members: add **Group → Member logins** under client tab (role-gated via `GET /mobile/me/session`).

### Phase E — Hardening

1. Align **approve/reject/disburse** flows with web’s origination transition rules where they diverge (audit `loan_origination_cycle_service` vs mobile’s direct `approve` endpoint usage).  
2. Update **OriginationStatus** TypeScript to `string` or discriminated union generated from API schema / OpenAPI if available.  
3. Documentation: link this guide from `loanmanagementapp/README.md` (one line).

---

## 6. Key backend references (implementation lookup)

| Topic | Primary locations |
|-------|---------------------|
| Group parent check / member IDs | `app/services/group_loan_allocation_service.py` |
| Create application guards | `app/services/loan_service.py` → `LoanApplicationService.create_loan_application` |
| Validate group origination | `app/api/v1/routers/loans.py` → `validate_group_loan_origination` |
| Origination status | `GET …/origination-status` in `loans.py` + `loan_origination_readiness.py` |
| Members / leaders | `app/api/v1/routers/clients.py`, `group_client_leader_service.py`, `group_member_credentials_service.py` |
| Mobile client session / member credentials | `app/api/v1/routers/mobile_client.py` |
| Web parity UI | `cofi-bms-dashboard/components/loans/LoanApplicationForm.tsx`, `LoanApplicationManagement.tsx`, `ClientGroupMembersContent.tsx`, `ClientGroupLeadersContent.tsx` |

---

## 7. Success criteria

- [ ] LO can **add and list group members** on mobile for a group parent client without using web.  
- [ ] LO can **assign group leaders and permissions** on mobile **or** documented intentional deferral with zero blockers for origination.  
- [ ] LO can **create a group loan application** with **validated** `group_loan_allocation`, pass API checks, and complete collateral/guarantor steps including **pledgor** when required.  
- [ ] Mobile handles **origination-status** `next_step` values the API returns for group loans without silent failure.  
- [ ] **Chair / parent** can provision **member login credentials** on mobile if required by operations (uses existing `/mobile/group/…` endpoints).  
- [ ] Regression: **individual** origination unchanged; offline mode policy documented for group.

---

## 8. Notes for future maintainers

- Keep **web BMS** as the reference UX for complex origination until mobile reaches parity; avoid diverging business rules in the app — **single source of truth is the API**.  
- When adding endpoints to `api.ts`, mirror **request/response shapes** from `cofi-bms-api` Pydantic schemas to prevent subtle validation errors (422).  
- The **web client portal** is intentionally separate from loanmanagementapp; feature flags can hide borrower portal on web in environments where mobile-only is required, but that is a product decision outside this guide.

---

*Generated for CoFi / Tradeline — aligns `loanmanagementapp` with `cofi-bms-dashboard` + `cofi-bms-api` group loan and client-management capabilities as of the upgrade work described in this repository.*
