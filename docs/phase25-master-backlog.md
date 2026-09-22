# Phase 25 WP8: Prioritized Master Backlog

**Date:** 2026-09-22
**Phase:** 25
**Status:** COMPLETED

---

## 1. Critical Fixes

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| C1 | Fix DB test resilience to dirty state | Tests fail with FK violations on dirty DB | None | HIGH | Immediate | DOCUMENTED |
| C2 | Create Order model | Core commercial requirement | None | HIGH | Phase 26 | MISSING |
| C3 | Create Payment model | Core commercial requirement | None | HIGH | Phase 26 | MISSING |
| C4 | Create FundedAccount management layer | Transition from evaluation to funded | C2 | HIGH | Phase 26 | MISSING |
| C5 | Implement evaluation creation API | Start evaluation flow | None | HIGH | Phase 26 | MISSING |
| C6 | Implement rule evaluation engine | Rule enforcement | C5 | HIGH | Phase 26 | MISSING |
| C7 | Create Payout model and workflow | Trader payouts | C3 | HIGH | Phase 27 | MISSING |
| C8 | Create Refund model and workflow | Transaction reversals | C3 | HIGH | Phase 27 | MISSING |
| C9 | Create Dispute model and workflow | Dispute handling | C3, C7 | HIGH | Phase 27 | MISSING |
| C10 | Create Notification model and service | User notifications | None | MEDIUM | Phase 26 | MISSING |
| C11 | Create Transaction/Ledger model | Financial records | C2, C3 | HIGH | Phase 26 | MISSING |
| C12 | Create Evidence model and storage | Breach evidence | C5 | MEDIUM | Phase 27 | MISSING |
| C13 | Enforce audit log immutability (DB trigger) | Audit compliance | None | MEDIUM | Phase 26 | DOCUMENTED |
| C14 | Implement CI/CD pipeline | Deployment automation | None | HIGH | Phase 26 | MISSING |
| C15 | Configure database backup | Data protection | None | HIGH | Phase 26 | MISSING |

---

## 2. Core Commercial Business Engine

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| B1 | Order lifecycle engine | Trading operations | C2 | HIGH | Phase 26 | MISSING |
| B2 | Payment processing engine | Financial operations | C3, C11 | HIGH | Phase 27 | MISSING |
| B3 | Funded account transition workflow | Evaluation → Funded | C4 | HIGH | Phase 26 | MISSING |
| B4 | Payout request and processing | Trader withdrawals | C7 | HIGH | Phase 27 | MISSING |
| B5 | Refund processing | Transaction reversals | C8 | MEDIUM | Phase 27 | MISSING |
| B6 | Dispute creation and resolution | Dispute handling | C9 | MEDIUM | Phase 27 | MISSING |
| B7 | Notification service | Email, in-app, push | C10 | MEDIUM | Phase 26 | MISSING |
| B8 | Ruleset evaluation engine | Apply rules to evaluations | C6 | HIGH | Phase 27 | MISSING |
| B9 | Pass/fail decision API | Evaluation outcomes | C6 | MEDIUM | Phase 27 | MISSING |
| B10 | Breach evidence storage | Evidence management | C12 | MEDIUM | Phase 27 | MISSING |
| B11 | Financial ledger and reconciliation | Financial tracking | C11 | HIGH | Phase 27 | MISSING |
| B12 | Global multi-currency support | Global platform | C3 | MEDIUM | Phase 28 | MISSING |

---

## 3. Trader Dashboard

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| T1 | Replace dashboard placeholder | Current page is static | None | HIGH | Phase 26 | MISSING |
| T2 | Evaluation progress tracking | Trader needs to see progress | C5 | HIGH | Phase 26 | MISSING |
| T3 | Account status display | Show funded/evaluation status | C4 | HIGH | Phase 26 | MISSING |
| T4 | Ruleset/evaluation selection | Start evaluation from dashboard | C5 | MEDIUM | Phase 27 | MISSING |
| T5 | Profile management | Edit profile info | None | MEDIUM | Phase 27 | MISSING |
| T6 | Performance analytics | PnL, drawdown tracking | C11 | LOW | Phase 28 | MISSING |
| T7 | Notification center | View notifications | C10 | MEDIUM | Phase 27 | MISSING |

---

## 4. Admin Command Center

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| A1 | Unified admin dashboard | Current admin has separate tabs | None | MEDIUM | Phase 26 | MISSING |
| A2 | Trader management UI | Admin manage traders | None | HIGH | Phase 27 | MISSING |
| A3 | Audit log viewer | Review audit trail | C13 | MEDIUM | Phase 27 | MISSING |
| A4 | Funded account management UI | Admin manage funded accounts | C4 | HIGH | Phase 27 | MISSING |
| A5 | Financial overview | View payments, payouts, transactions | C3, C11 | HIGH | Phase 27 | MISSING |
| A6 | Bulk operations | Bulk actions on accounts | None | LOW | Phase 28 | MISSING |
| A7 | Dashboard customization | Configurable admin views | None | LOW | Phase 28 | MISSING |

---

## 5. Payments and Financial Ledger

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| P1 | Payment processing | Process payments | C3 | HIGH | Phase 27 | MISSING |
| P2 | Invoice generation | Billing records | C3 | MEDIUM | Phase 27 | MISSING |
| P3 | Transaction history | Financial audit trail | C11 | HIGH | Phase 27 | MISSING |
| P4 | Transaction reconciliation | Match payments to accounts | C11 | HIGH | Phase 27 | MISSING |
| P5 | Subscription billing | Recurring payments | C3 | HIGH | Phase 28 | MISSING |
| P6 | Credit card processing | Payment method integration | External | HIGH | Phase 28 | BLOCKED |
| P7 | Bank transfer processing | Payment method integration | External | MEDIUM | Phase 28 | BLOCKED |

---

## 6. Funded Accounts and Payouts

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| F1 | Funded account creation | Create funded accounts | C4 | HIGH | Phase 26 | MISSING |
| F2 | Funded account status management | Track funded account lifecycle | C1 | HIGH | Phase 27 | MISSING |
| F3 | Payout request submission | Trader requests payout | C7 | HIGH | Phase 27 | MISSING |
| F4 | Payout approval workflow | Admin approves payouts | C7 | HIGH | Phase 27 | MISSING |
| F5 | Payout processing | Execute payouts | C7, P6 | HIGH | Phase 28 | BLOCKED |
| F6 | Account transition from evaluation | Evaluation → Funded | B3 | HIGH | Phase 26 | MISSING |
| F7 | Account closure workflow | Close funded accounts | F2 | MEDIUM | Phase 28 | MISSING |

---

## 7. MT5 Worker and Live Monitoring

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| M1 | Deploy monitoring worker daemon | Run worker as service | C14 | HIGH | Phase 27 | BLOCKED |
| M2 | Deploy MT5 on Windows EC2 | Live MT5 monitoring | C14, External | HIGH | Phase 27 | BLOCKED |
| M3 | Worker-to-app communication | Worker reports to app | C14 | HIGH | Phase 27 | MISSING |
| M4 | Worker health checks | Monitor worker status | M1 | HIGH | Phase 27 | MISSING |
| M5 | Live MT5 connectivity | Connect to real MT5 | External | HIGH | Phase 28 | BLOCKED |
| M6 | Automated account provisioning | Auto-create MT5 accounts | M5 | HIGH | Phase 28 | BLOCKED |
| M7 | Monitoring alerting | Alert on issues | M1 | MEDIUM | Phase 28 | MISSING |
| M8 | Log aggregation | Centralized logging | M1 | MEDIUM | Phase 28 | MISSING |
| M9 | MT5 health check endpoint | System health API | M1 | MEDIUM | Phase 27 | MISSING |

---

## 8. Cloud Infrastructure

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| CL1 | Vercel deployment config | Deploy app | C14 | HIGH | Phase 26 | MISSING |
| CL2 | AWS EC2 setup (Windows) | MT5 and worker | C14 | HIGH | Phase 27 | MISSING |
| CL3 | AWS security groups | Firewall rules | CL2 | HIGH | Phase 27 | MISSING |
| CL4 | Environment separation | Dev/staging/prod | None | HIGH | Phase 26 | MISSING |
| CL5 | Secrets management | Vault for secrets | None | HIGH | Phase 26 | MISSING |
| CL6 | CDN configuration | Static asset delivery | CL1 | MEDIUM | Phase 27 | MISSING |
| CL7 | Database backup schedule | Data protection | C15 | HIGH | Phase 26 | MISSING |
| CL8 | Disaster recovery plan | DR procedures | C15 | HIGH | Phase 27 | MISSING |
| CL9 | Auto-scaling config | Handle traffic | CL1 | MEDIUM | Phase 28 | MISSING |
| CL10 | Multi-region deployment | Global latency | CL1 | LOW | Phase 28 | MISSING |

---

## 9. Security and Compliance Preparation

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| S1 | MFA/2FA implementation | Account security | None | HIGH | Phase 27 | MISSING |
| S2 | Password reset flow | Account recovery | None | MEDIUM | Phase 27 | MISSING |
| S3 | Session forced revocation | Logout all devices | None | MEDIUM | Phase 27 | MISSING |
| S4 | Security audit | Penetration testing | None | HIGH | Phase 27 | BLOCKED |
| S5 | GDPR compliance | Data regulation | None | HIGH | Phase 28 | MISSING |
| S6 | SOC 2 compliance | Trust certification | S4 | HIGH | Phase 28 | BLOCKED |
| S7 | Key rotation | Encryption key lifecycle | None | MEDIUM | Phase 28 | MISSING |
| S8 | Rate limit visibility | API rate limit headers | None | LOW | Phase 27 | MISSING |
| S9 | General application logging | Production visibility | None | MEDIUM | Phase 26 | MISSING |
| S10 | Error tracking service | Error monitoring | None | MEDIUM | Phase 27 | MISSING |

---

## 10. Global Launch Readiness

| # | Requirement | Reason | Dependencies | Risk | Suggested Phase | Status |
|---|------------|--------|-------------|------|----------------|--------|
| G1 | Load testing | Performance benchmarks | CL1 | HIGH | Phase 28 | MISSING |
| G2 | CI/CD pipeline | Automated testing/deploy | C14 | HIGH | Phase 26 | MISSING |
| G3 | Legal compliance review | Terms, privacy, etc. | External | HIGH | Phase 28 | BLOCKED |
| G4 | Terms of service | Legal requirement | External | HIGH | Phase 28 | BLOCKED |
| G5 | Privacy policy | Legal requirement | External | HIGH | Phase 28 | BLOCKED |
| G6 | Marketing site | Landing page | None | MEDIUM | Phase 27 | MISSING |
| G7 | Customer support system | Support channels | None | MEDIUM | Phase 28 | MISSING |
| G8 | Data export (GDPR) | User data export | None | MEDIUM | Phase 28 | MISSING |
| G9 | Account deletion (GDPR) | User data deletion | None | MEDIUM | Phase 28 | MISSING |

---

## 11. Deferred Features

| # | Requirement | Reason | Dependencies |
|---|------------|--------|-------------|
| D1 | Dashboard customization | Low priority | None |
| D2 | Advanced analytics | Low priority | C11 |
| D3 | Multi-currency support | Medium priority | C3 |
| D4 | Bank transfer processing | External dependency | P7 |
| D5 | SOC 2 compliance | External dependency | S4 |
| D6 | Auto-scaling | Scale-dependent | CL1 |

---

## Backlog Summary

| Category | Items | Critical Path |
|----------|-------|--------------|
| Critical Fixes | 15 | C1-C15 |
| Core Business Engine | 12 | B1-B12 |
| Trader Dashboard | 7 | T1-T7 |
| Admin Command Center | 7 | A1-A7 |
| Payments & Financial | 7 | P1-P7 |
| Funded Accounts | 7 | F1-F7 |
| MT5 & Monitoring | 9 | M1-M9 |
| Cloud Infrastructure | 10 | CL1-CL10 |
| Security & Compliance | 10 | S1-S10 |
| Launch Readiness | 9 | G1-G9 |
| Deferred | 6 | D1-D6 |
| **Total** | **109** | |

---

## Phased Implementation Plan

| Phase | Focus | Key Items |
|-------|-------|-----------|
| Phase 26 | Foundation & Core | C2, C3, C5, C11, C14, C15, B3, T1, A1, CL1, CL4, CL5, CL7, S9, G2 |
| Phase 27 | Business Engine | C4, C6, C7, C8, C9, C10, B1, B2, B4, B5, B6, T2-T5, A2-A4, F1-F3, P1-P4, M1, M3-M4, CL2, CL3, S1-S3, S8, G6 |
| Phase 28 | Scale & Compliance | B7-B12, T6, A5-A7, F4-F7, P5-P7, M5-M9, CL6, CL9, CL10, S7, S10, G1, G5-G9 |
| Phase 29 | Launch | C13, B8-B10, C12, S4, S5, G3-G4, G7 |
