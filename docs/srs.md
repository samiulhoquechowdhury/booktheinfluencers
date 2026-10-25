# SRS — Talent & Celebrity Booking Platform

> Software Requirements Specification · v1.0 · 16 Oct 2026
> Scope: Phase 1 (MVP) in full; Phase 2+ requirements listed as "Future" (F).
> Related: `prd.md`, `trd.md`, `architecture.md`

---

## 1. Introduction

### 1.1 Purpose
Defines functional and non-functional requirements for the MVP of a managed talent booking platform (customer web app, talent portal, admin CRM, API).

### 1.2 Definitions
| Term | Meaning |
|---|---|
| Talent | A bookable person or act (singer, DJ, comedian, speaker, creator…) |
| Representative (Rep) | Authorized manager/agency for a talent |
| Enquiry / Lead | A customer's event brief before confirmation |
| Booking | The commercial record for one talent at one event |
| Quote | Itemized price offer for a booking |
| Selling price | What customer pays (excluding taxes unless stated) |
| Payout | What talent/rep receives per contract |
| Margin | Selling price − payout − direct costs; restricted data |
| Fee band | Indicative min–max range shown publicly |
| Milestone | Scheduled payment part (advance, balance) |

### 1.3 Requirement keywords
**MUST** = required for MVP release. **SHOULD** = MVP if time allows. **F** = future phase.

---

## 2. Overall description

### 2.1 System components
1. **Customer web app** (public + logged-in)
2. **Talent / Rep portal** (light in MVP)
3. **Admin CRM** (internal staff)
4. **API** (single backend for all)
5. Integrations: payment gateway, e-sign, email, SMS/WhatsApp, object storage

### 2.2 User roles
| Role | Code | Access summary |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Everything, role management, settings |
| Sales Executive | `SALES` | Leads, shortlists, quotes, negotiation, customer comms |
| Talent Manager (internal) | `TALENT_MANAGER` | Assigned talents, availability checks, rep comms |
| Operations | `OPS` | Confirmed bookings, logistics, event-day |
| Accounts | `ACCOUNTS` | Payments, invoices, refunds, payouts, margin |
| Talent / Rep | `TALENT` / `REP` | Own profile, bookings, availability, own payout |
| Customer | `CUSTOMER` | Own enquiries, quotes, bookings, payments, documents |

### 2.3 Constraints
- Web-first, responsive, PWA-capable. No native apps in MVP.
- Data hosted in an India cloud region.
- Currency INR; amounts stored in paise (integer).
- Timezone Asia/Kolkata for display; UTC in storage.

---

## 3. Functional requirements

### 3.1 Authentication & accounts (AUTH)
| ID | Requirement | Pri |
|---|---|---|
| AUTH-1 | Customers sign up / log in with phone OTP; email optional | MUST |
| AUTH-2 | Staff log in with email + password + MFA (TOTP) | MUST |
| AUTH-3 | Talent/Rep accounts are created by admin via invite link only | MUST |
| AUTH-4 | Customer may submit an enquiry as guest; account auto-created on OTP verify | MUST |
| AUTH-5 | Sessions expire; refresh tokens rotate; logout revokes | MUST |
| AUTH-6 | Corporate organisation accounts with multiple members | F (P3) |

### 3.2 Talent catalogue & discovery (CAT)
| ID | Requirement | Pri |
|---|---|---|
| CAT-1 | List talent by category with pagination | MUST |
| CAT-2 | Filters: category, city/base city, travels-to, event type, language, fee band, verified only | MUST |
| CAT-3 | Keyword search on name, tags, bio (PostgreSQL full-text) | MUST |
| CAT-4 | Date filter hides talents with a blackout on that date (never implies available) | SHOULD |
| CAT-5 | Profile page: media gallery, showreel link, bio, languages, event types, past events, representation label, verified badge, fee band, CTA | MUST |
| CAT-6 | CTA text: "Check Availability" for premium tier; "Request to Book" otherwise. Never "Book Now" | MUST |
| CAT-7 | Fee band shown as range ("₹2L – ₹4L") or "On request"; never a single final price | MUST |
| CAT-8 | Favourites for logged-in customers | MUST |
| CAT-9 | Compare up to 3 talents | SHOULD |
| CAT-10 | City/event SEO landing pages (server-rendered, metadata, sitemap) | MUST |
| CAT-11 | Only `PUBLISHED` + verified-rep talents appear publicly | MUST |
| CAT-12 | Reviews and ratings | F (P2) |
| CAT-13 | AI brief → shortlist | F (P4) |

### 3.3 Enquiry / event brief (ENQ)
| ID | Requirement | Pri |
|---|---|---|
| ENQ-1 | Form fields: event type, date (+ alt date), city, venue, audience size, duration, budget range, preferred talent(s) (0..n), language, notes, contact name/phone/email, company (optional), GST number (optional) | MUST |
| ENQ-2 | Submitting creates a Lead in `NEW` stage and one draft Booking per selected talent | MUST |
| ENQ-3 | Customer receives acknowledgement (email + SMS/WhatsApp) with reference number | MUST |
| ENQ-4 | Spam protection: rate limit + captcha/turnstile + OTP | MUST |
| ENQ-5 | Lead auto-assigned to a sales exec (round robin) | SHOULD |

### 3.4 Lead & booking pipeline (PIPE)
| ID | Requirement | Pri |
|---|---|---|
| PIPE-1 | Lead stages: `NEW → CONTACTED → REQUIREMENT_RECEIVED → SHORTLISTED → AVAILABILITY_CHECK → QUOTE_SENT → NEGOTIATION → ADVANCE_PENDING → CONFIRMED → EVENT_COMPLETED → SETTLEMENT → CLOSED`; terminal `LOST`, `CANCELLED` | MUST |
| PIPE-2 | Kanban and table views, filter by owner, stage, city, date, category | MUST |
| PIPE-3 | Stage transitions enforced by server state machine (see `trd.md` §5) | MUST |
| PIPE-4 | Each transition logged with actor, time, note | MUST |
| PIPE-5 | Lost reason required when moving to `LOST` | MUST |
| PIPE-6 | Internal notes and activity timeline on each lead | MUST |
| PIPE-7 | Follow-up reminders / tasks with due date | SHOULD |

### 3.5 Availability (AVL)
| ID | Requirement | Pri |
|---|---|---|
| AVL-1 | Per booking availability status: `NOT_CHECKED`, `AWAITING_MANAGER`, `HOLD_REQUESTED`, `AVAILABLE`, `TENTATIVE`, `UNAVAILABLE`, `CONFIRMED` | MUST |
| AVL-2 | Customer sees human labels: "Checking availability", "Awaiting manager confirmation", "Hold requested", "Available — quote coming", "Unavailable", "Confirmed" | MUST |
| AVL-3 | `CONFIRMED` set only by system when contract signed AND advance paid AND rep accepted | MUST |
| AVL-4 | Talent blackout dates managed by admin/talent manager | MUST |
| AVL-5 | Rep self-service availability; calendar sync | F (P2) |

### 3.6 Quotation (QUO)
| ID | Requirement | Pri |
|---|---|---|
| QUO-1 | Line item types: `TALENT_FEE`, `TRAVEL`, `ACCOMMODATION`, `LOCAL_TRANSPORT`, `SECURITY`, `PRODUCTION`, `SERVICE_FEE`, `OTHER`; taxes computed | MUST |
| QUO-2 | Each line has customer amount; internal cost and payout fields hidden from customer | MUST |
| QUO-3 | Quote shows payment schedule (milestones: % or amount + due date) | MUST |
| QUO-4 | Quote has validity date; expired quotes cannot be accepted | MUST |
| QUO-5 | Versioning: revisions create new version; history kept | MUST |
| QUO-6 | Quote below talent minimum rate or margin below threshold requires `SUPER_ADMIN` approval | MUST |
| QUO-7 | Customer accepts online (records IP, timestamp, user) or requests changes | MUST |
| QUO-8 | PDF of quote generated | MUST |
| QUO-9 | Rep accept/reject/counter in portal | F (P2) |

### 3.7 Contracts (CON)
| ID | Requirement | Pri |
|---|---|---|
| CON-1 | Contract generated from template with booking data (scope, date, duration, rider, cancellation, payment, deliverables, usage rights) | SHOULD (MVP may upload PDF) |
| CON-2 | Send for e-sign to customer (and rep where required); track status | MUST |
| CON-3 | Signed PDF stored in document vault; immutable | MUST |
| CON-4 | Template library with versions | F (P2) |

### 3.8 Payments (PAY)
| ID | Requirement | Pri |
|---|---|---|
| PAY-1 | Create payment link / checkout per milestone via gateway | MUST |
| PAY-2 | Methods: UPI, cards, net banking (gateway-provided) | MUST |
| PAY-3 | Payment status updated only via verified gateway webhook (signature check, idempotent) | MUST |
| PAY-4 | Manual payment entry (bank transfer) by `ACCOUNTS` with proof upload | MUST |
| PAY-5 | Receipts emailed | MUST |
| PAY-6 | Refunds recorded; gateway refund API | SHOULD (MVP manual) |
| PAY-7 | GST tax invoice generation | F (P2) — MVP: proforma + manual invoice upload |

### 3.9 Booking confirmation & operations (OPS)
| ID | Requirement | Pri |
|---|---|---|
| OPS-1 | Booking auto-moves to `CONFIRMED` when: quote accepted + contract signed + advance milestone paid + rep acceptance recorded | MUST |
| OPS-2 | Confirmation notification to customer, talent/rep, ops | MUST |
| OPS-3 | Ops checklist per booking: travel, hotel, ground transport, rider, reporting time, point of contact | SHOULD |
| OPS-4 | Mark event completed with completion note | MUST |
| OPS-5 | Cancellation with reason and policy reference; triggers refund calculation | MUST |
| OPS-6 | Dispute workflow | F (P2) |

### 3.10 Settlement (SET)
| ID | Requirement | Pri |
|---|---|---|
| SET-1 | After completion, payout record created = contracted payout | MUST |
| SET-2 | Accounts marks payout paid with reference (manual in MVP) | MUST |
| SET-3 | Margin per booking computed and stored | MUST |
| SET-4 | Settlement statements for talent | F (P2) |

### 3.11 Customer dashboard (CUS)
| ID | Requirement | Pri |
|---|---|---|
| CUS-1 | List of enquiries/bookings with status | MUST |
| CUS-2 | Booking detail: brief, status timeline, quote(s), contract, payments, documents | MUST |
| CUS-3 | Messages with assigned manager | SHOULD (MVP: WhatsApp/phone link) |

### 3.12 Talent portal (TAL)
| ID | Requirement | Pri |
|---|---|---|
| TAL-1 | View own bookings (date, city, event, status) | MUST |
| TAL-2 | See only contracted payout; never selling price or margin | MUST |
| TAL-3 | View/edit blackout dates (if enabled by admin) | SHOULD |
| TAL-4 | Edit media kit, rider, fee bands (admin approval) | F (P2) |

### 3.13 Admin talent management (ADM)
| ID | Requirement | Pri |
|---|---|---|
| ADM-1 | Create/edit talent: profile, categories, tags, languages, base city, media, event types | MUST |
| ADM-2 | Rate card: minimum rate, standard selling rate, commission %, notes per event type | MUST |
| ADM-3 | Link talent to Rep(s); rep verification status `PENDING/VERIFIED/REJECTED` with KYC docs | MUST |
| ADM-4 | Representation type: `TALENT_MANAGED`, `AGENCY_MANAGED`, `PLATFORM_COORDINATED` | MUST |
| ADM-5 | Profile status: `DRAFT`, `PUBLISHED`, `HIDDEN`; tier `STANDARD`/`PREMIUM` | MUST |
| ADM-6 | Bulk import talent via CSV | SHOULD |

### 3.14 Analytics (ANA)
| ID | Requirement | Pri |
|---|---|---|
| ANA-1 | Dashboard: leads by stage, bookings, GMV, conversion (enquiry→quote, quote→confirmed), avg booking value, time-to-confirm | MUST |
| ANA-2 | Filters by date range, category, city, owner | MUST |
| ANA-3 | Margin, receivables, pending payouts (ACCOUNTS/SUPER_ADMIN only) | MUST |

### 3.15 Notifications (NOT)
| ID | Event | Channels | Pri |
|---|---|---|---|
| NOT-1 | Enquiry received | Email, SMS/WA | MUST |
| NOT-2 | Quote sent / revised | Email, SMS/WA | MUST |
| NOT-3 | Payment link / reminder / received | Email, SMS/WA | MUST |
| NOT-4 | Contract sent / signed | Email | MUST |
| NOT-5 | Booking confirmed | Email, SMS/WA | MUST |
| NOT-6 | Event reminder (T-3 days, T-1 day) | Email, SMS/WA | SHOULD |
| NOT-7 | Feedback request after completion | Email, WA | SHOULD |
| NOT-8 | Internal: new lead assigned, stage overdue | In-app, email | MUST |

### 3.16 Audit (AUD)
| ID | Requirement | Pri |
|---|---|---|
| AUD-1 | Log create/update/delete on bookings, quotes, payments, payouts, rate cards, roles | MUST |
| AUD-2 | Log includes actor, action, entity, before/after diff, IP, timestamp | MUST |
| AUD-3 | Audit log read-only, SUPER_ADMIN only | MUST |

---

## 4. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | Public pages LCP < 2.5 s on 4G; API p95 < 400 ms for reads |
| NFR-2 | Availability | 99.5% monthly for MVP |
| NFR-3 | Security | OWASP Top 10 mitigated; RBAC on every endpoint; MFA for staff |
| NFR-4 | Privacy | DPDP Act 2023 aligned: consent, purpose limitation, data export/delete on request |
| NFR-5 | Data | Daily automated DB backups, 30-day retention, tested restore |
| NFR-6 | Documents | Private storage; access only via signed URLs (≤ 15 min) |
| NFR-7 | Money | Integer paise, no floats; all money changes audited |
| NFR-8 | Accessibility | WCAG 2.1 AA for customer app |
| NFR-9 | SEO | SSR/SSG for public pages, structured data, sitemap |
| NFR-10 | Browser support | Last 2 versions of Chrome, Safari, Edge, Firefox; Android Chrome, iOS Safari |
| NFR-11 | Observability | Structured logs, error tracking, uptime monitoring |
| NFR-12 | Scalability | Stateless API, horizontal scaling; catalogue up to 10k talents without search engine change |

---

## 5. External interfaces
| Interface | Purpose |
|---|---|
| Payment gateway (Razorpay assumed) | Payment links, checkout, webhooks, refunds |
| E-sign provider (TBD) | Send, track, fetch signed contracts |
| Email (Resend / SES) | Transactional emails |
| SMS / WhatsApp (MSG91 / Gupshup / Meta Cloud API) | OTP, templates |
| Object storage (S3-compatible) | Media, contracts, KYC |
| Captcha (Cloudflare Turnstile) | Form protection |

## 6. Acceptance criteria for MVP release
1. A customer can go from search → enquiry → quote acceptance → advance payment → signed contract → confirmed booking without staff touching a database.
2. A talent never sees margin or selling price in any API response or UI.
3. No booking reaches `CONFIRMED` without all four conditions in OPS-1.
4. All payments reconcile with gateway records.
5. Every money and status change appears in the audit log.
6. Pilot completes ≥ N controlled bookings end-to-end (N set in Phase 0).
