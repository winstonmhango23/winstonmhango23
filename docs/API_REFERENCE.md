# CoFi BMS API Reference (cofi-bms-api on Railway)

**Base URL:** `https://cofi-bms-api-production.up.railway.app/api/v1`

---

## Auth

| Method | Path | Auth | Body | Notes |
|--------|------|------|------|-------|
| POST | `/client/client-auth/token` | - | `{email, password}` | Client login. Returns `{access_token, token_type}` |
| POST | `/client/client-auth/register` | - | ClientCreate | Client registration |
| POST | `/auth/token` | - | `{email, password, device_type?, device_identifier?, mac_address?}` | Staff login. Returns `{access_token, token_type}` |

---

## Loan Applications

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/loans/apply` | Client | LoanApplicationCreate. Overrides client_id. Requires branch_id, loan_product_id |
| POST | `/customer/loan-applications` | Client | LoanApplicationSelfServiceCreate: loan_product_id, requested_amount, loan_purpose, repayment_frequency, term_months |
| GET | `/loans/my-applications` | Client | Client's applications |
| GET | `/loans/applications` | Staff | ?branch_id, ?client_id |
| GET | `/loans/applications/{id}` | Staff | Single application |
| PUT | `/loans/applications/{id}` | Staff | Update status, approved_amount, etc. |
| POST | `/loans/applications/{id}/approve` | Staff | Body: {approved_amount?, approved_term_months?, interest_rate?} |
| POST | `/loans/applications/{id}/reject` | Staff | Reject application |
| POST | `/loans/applications/{id}/create-loan` | Staff | Disburse – create loan from approved application |

---

## Loans

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/loans/my-loans` | Client | Client's loans |
| GET | `/loans/{id}` | Staff | Single loan |
| GET | `/loans/{id}/schedule` | Staff | Repayment schedule (installments) |
| GET | `/loans/{id}/repayments` | Staff | Repayment history |
| POST | `/loans/repayments` | Staff | LoanRepaymentCreate: loan_id, client_id, principal_amount, interest_amount, penalty_amount, total_amount |

---

## Customer Portal (Client)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/customer/dashboard` | Client | Overview, client_info, summary |
| GET | `/customer/repayments` | Client | Client's repayment history. ?limit=50 |
| GET | `/customer/payment-schedules` | Client | Client's payment schedules |
| GET | `/customer/payment-schedules/upcoming` | Client | ?days=30 |
| PUT | `/customer/profile` | Client | Update profile |
| PUT | `/customer/settings` | Client | Notification prefs (email_notifications, sms_notifications, push_notifications) |

---

## Repayments (Staff)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/repayments/due-today` | Staff | ?branch_id |
| GET | `/repayments/overdue` | Staff | ?branch_id |
| GET | `/repayments/upcoming` | Staff | ?branch_id, ?days=7 |

---

## Staff

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/staff/digest` | Staff | ?digest_date=YYYY-MM-DD |
| GET | `/staff/notifications` | Staff | ?status=UNREAD|READ, ?limit=50 |
| GET | `/staff/notifications/unread-count` | Staff | Returns `{count}` |
| PUT | `/staff/notifications/{id}/read` | Staff | Mark as read |

---

## Device

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/device/push-token` | Client or Staff | Body: `{push_token, platform?}`. Registers push token for mobile notifications. |

---

## Products & Clients

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/loans/products` | Staff | Loan products (for apply form) |
| GET | `/clients` | Staff | Paginated. ?branch_id, ?skip, ?limit |
| GET | `/clients/{id}` | Staff | Single client |

---

## Missing / To Add

- `POST /device/push-token` – Push token registration (not in backend yet)
- Client self-service notification prefs: use `/customer/settings` for push/sms/email
