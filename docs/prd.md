# PRD — Talent & Celebrity Booking Platform

> Product Requirements Document · v1.0 · 16 Oct 2026
> Source: "Business Plan & Product Roadmap" (merged from the two Sept 2026 drafts)
> Working name: **Talent Booking Platform** (final brand name is an open decision)

---

## 1. Problem

Booking a celebrity, singer, DJ, comedian, speaker or creator in India today means calling multiple agents, getting unclear prices, no written terms, unsafe advance payments and no single point of coordination. Talent managers, in turn, deal with unqualified enquiries and late payments.

## 2. Product summary

An India-first **managed** talent booking platform. Customers discover verified talent and submit one brief; our team verifies availability, negotiates, issues a quotation and contract, collects payment, coordinates delivery and settles the talent — all on one booking record.

It combines four businesses in one system:

1. Talent marketplace (discovery)
2. Booking engine (enquiry → quote → contract → payment → settlement)
3. Influencer campaign platform (Phase 3)
4. Internal talent-management CRM

**Positioning:** Book verified talent for any event — celebrities, singers, athletes, comedians, DJs, creators and speakers — with professional contracts, payments and end-to-end coordination.

## 3. Core principles (non-negotiable)

| # | Principle | Product consequence |
|---|---|---|
| P1 | Request to Book, not instant booking | Premium talent shows **Check Availability**, never "Book Now" |
| P2 | Nothing is "confirmed" early | Confirmed only after rep acceptance + signed contract + advance paid |
| P3 | Verified representation | Every profile labelled talent-managed / agency-managed / platform-coordinated |
| P4 | Indicative ≠ final price | Profiles show a fee **band**; only a verified quote shows a final number |
| P5 | Price confidentiality | Customer sees selling price; talent sees payout; margin visible to finance/admin only |
| P6 | No false endorsement | Celebrity names/images never imply endorsement or exclusive representation |
| P7 | Technology supports the relationship team | Concierge humans handle high-value bookings; software makes them fast |

## 4. Goals and success metrics

| Goal | Metric | Notes |
|---|---|---|
| Prove the managed booking cycle | # bookings completed end-to-end in pilot | Gate to Phase 2 |
| Fast qualification | Enquiry-to-quote rate, time-to-quote | |
| Right pricing and fit | Quote-to-confirmation rate | |
| Speed of verification | Time-to-confirm (enquiry → confirmed) | |
| Business size | GMV, average booking value | |
| Unit economics | Contribution margin per booking | After ops cost |
| Retention | Repeat-booking rate (corporates, planners) | |

Numeric targets are set after the pilot baseline.

## 5. Users and personas

| Persona | Who | Primary job |
|---|---|---|
| Corporate buyer | HR/admin/marketing at a company | Book talent for annual day, conference, launch, awards with GST invoice and approvals |
| Event / wedding planner | Agency professional | Book many acts for many clients, fast, repeatably |
| Brand / marketing agency | Brand manager | Run creator and celebrity campaigns with tracked deliverables |
| Private customer | Individual | Book a singer/DJ/celebrity for a wedding or celebration |
| Institution | College, club, hotel, mall, government body, sports org | Book for festivals, shows, seasonal events |
| Talent | Artist / creator / speaker | Get qualified bookings, clear terms, on-time payouts |
| Talent representative | Manager / agency | Manage roster availability, quotes and contracts |
| Internal staff | Sales, talent managers, ops, accounts, super admin | Run the pipeline end to end |

## 6. Talent categories

Launch (3–5): **Singers, DJs, Comedians, Anchors/Speakers, Creators.**
Later: Film stars/actors/celebrities, ex-cricketers/athletes, models, influencers/YouTubers, regional/specialty (dancers, magicians, folk artists, chefs, authors).

## 7. Scope by phase

### Phase 0 — Discovery and UX (2–3 weeks)
Requirements, flows, wireframes, design system; lock brand, launch categories, commission rules, first manager partners.

### Phase 1 — MVP: Marketplace, booking and admin CRM (8–12 weeks build + 2–4 weeks QA/pilot)

**Customer**
- Landing, search, category pages, filters (category, city, date, event type, budget, language, verified)
- Talent profile: photos, showreel, bio, languages, event suitability, indicative fee band, representation label
- Favourites
- Request-to-book / event brief form
- Customer login (OTP), booking dashboard, quotation view & acceptance
- Payment via gateway / payment link (advance + milestones)
- Contract view + e-sign (or upload)
- Notifications (email + SMS/WhatsApp template)

**Talent (light)**
- Talent / representative login, view bookings and their own payout amounts, basic calendar/blackout dates

**Admin / operations CRM**
- Lead & booking pipeline (Kanban + list)
- Talent master database, rate cards (minimum, selling rate), commission
- Manager/agency database + verification (KYC, authority proof)
- Shortlist builder
- Quote builder with line items + approval
- Contract upload / e-sign trigger, document vault
- Payment links, payment status, manual reconciliation
- Basic analytics: pipeline, bookings, GMV, conversion
- Role-based access, audit log

### Phase 2 — Management platform (8–16+ weeks)
Talent/manager self-service portal (accept/reject/counter quotes, media kit, rider), availability management & real-time calendars, contract templates, invoices (GST), payouts and settlement statements, commission calculations, refunds, WhatsApp automation, event operations (travel/hospitality/rider checklist), reviews, dispute/cancellation workflow.

### Phase 3 — Corporate and influencer marketing
Corporate accounts, approval chains, GST-ready billing, one requirement → multiple talent options, consolidated billing; campaign creation, creator selection, social metrics, content/draft approvals, deliverable tracking, post URLs, reach/engagement reports, brand dashboard.

### Phase 4 — Intelligence and scale
AI-assisted brief ("Hindi comedian, 500-person annual day, Guwahati, under ₹5 lakh" → shortlist for human verification), budget-aware matching, automated quote suggestions, dynamic recommendations, multi-city teams, agency accounts, API integrations, mobile apps (React Native), automated settlements, advanced analytics.

**Gates:** Phase 1 → 2 only when the full cycle (onboarding → enquiry → quote → payment → event → settlement) runs reliably in live bookings. Phase 2 → 3 only when booking operations are stable.

## 8. Key user stories (MVP)

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-01 | Customer | search talent by city, date, category, budget | I find suitable options fast |
| US-02 | Customer | see a verified badge, representation type and fee band | I trust the listing and know the range |
| US-03 | Customer | submit one event brief for one or more talents | I don't call five agents |
| US-04 | Customer | receive an itemized quote and accept it online | I see total cost, not just a headline fee |
| US-05 | Customer | pay an advance securely and sign a contract | my booking is protected |
| US-06 | Customer | track booking status and documents | I know exactly where things stand |
| US-07 | Sales exec | see every enquiry in a pipeline with stage and owner | nothing is dropped |
| US-08 | Talent manager | record availability check outcome per talent | the customer gets an honest status |
| US-09 | Sales exec | build a quote from rate card + costs + fees | quotes are fast and consistent |
| US-10 | Accounts | see collections, balances and pending payouts | money is traceable |
| US-11 | Talent | see my bookings and contracted payout only | I trust the platform |
| US-12 | Super admin | control roles and see an audit log | the business is secure and accountable |

## 9. Revenue model

| Stream | Model |
|---|---|
| Booking commission (margin) | 10–25% |
| Management commission (managed talent) | 15–30% |
| Customer service fee | 5–10%, shown on quote |
| Influencer / brand campaign management | 15–25% or per campaign |
| Production / logistics margin | Per booking |
| Corporate membership / retainer | Monthly / annual |
| Exclusive talent management | Contract based |
| Featured talent profiles | Subscription, clearly marked |

## 10. Out of scope for MVP
Native mobile apps, AI matching, influencer campaign module, corporate approval chains, automated payouts, real-time calendar sync, multi-language UI, public reviews.

## 11. Assumptions and open decisions
- [ ] Final brand name
- [ ] Launch geography (single city/region vs pan-India)
- [ ] Launch categories and first manager/agency partners
- [ ] Default commission and service-fee %
- [ ] Payment gateway (default assumption: Razorpay) and e-sign provider (e.g. Leegality / Digio)
- [ ] MVP budget ceiling and team size
- [ ] Legal/tax review: marketplace terms, GST/TDS, intermediary obligations, privacy (DPDP Act)
