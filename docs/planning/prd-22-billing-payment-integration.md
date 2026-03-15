# PRD — Billing & Payment Integration

**Status:** Planning - Technical Analysis & Design
**Date:** 2026-03-15
**Version:** 1.0
**Feature ID:** BILLING-001

---

## Executive Summary

**Objective:** Implement a comprehensive billing and payment integration system that enables the platform to process payments through multiple providers (Stripe and Assas), manage recurring billing and subscriptions, track transactions, and maintain financial reconciliation with integrated ERP systems.

**Problem:** The current platform lacks integrated payment processing capabilities, preventing monetization of services and limiting the ability to manage subscription-based models. Without payment integration, the platform cannot:
- Process customer payments securely
- Manage recurring billing and subscription lifecycles
- Track and reconcile financial transactions
- Maintain compliance with payment regulations
- Integrate with existing ERP systems for financial reporting

**Solution:** Build a modular payment integration layer that:
- Supports multiple payment providers (Stripe for international, Assas for Brazil)
- Handles subscription creation, renewal, and cancellation workflows
- Tracks all payment transactions with detailed metadata and audit trails
- Reconciles payments with ERP systems via automated integration
- Provides a unified billing API abstraction across different providers

**Value Proposition:**
- Enable subscription-based and one-time payment models
- Support multiple payment providers for geographic and regulatory flexibility
- Reduce manual reconciliation effort through automated ERP integration
- Provide comprehensive financial transparency and audit trails
- Enable dynamic pricing and billing strategies
- Improve customer experience with flexible payment options

**Scope:** Full implementation of payment processing pipeline including provider integration, subscription management, transaction tracking, and ERP reconciliation

---

## Problem Statement

### Current State

The application currently:
- Has no payment processing capabilities
- Cannot accept customer payments or manage subscriptions
- Has no mechanism for tracking financial transactions
- Cannot reconcile payments with backend ERP systems
- Does not support different payment models (one-time vs recurring)
- Lacks financial reporting and audit trail capabilities

### Pain Points

1. **No Revenue Stream:** Inability to monetize platform services
2. **Manual Billing:** No automated subscription management or renewal workflows
3. **Financial Opacity:** Lack of transaction tracking and reporting
4. **Integration Gap:** No connection between payment data and ERP systems
5. **Regulatory Risk:** Absence of proper payment compliance and audit trails
6. **Limited Flexibility:** Cannot support multiple payment providers
7. **Customer Friction:** No self-service billing management capabilities

### Key Assumptions

- Stripe will be primary provider for international markets
- Assas will be primary provider for Brazilian market
- ERP system has API/webhooks for financial data synchronization
- Payment data must be stored securely with PCI compliance considerations
- Subscriptions should support monthly, quarterly, and annual billing cycles
- Reconciliation happens in near-real-time via webhook integrations
- Platform will use idempotent transaction IDs to prevent duplicate charges

---

## Objectives

### Primary Objectives

1. **Multi-Provider Payment Processing:** Integrate Stripe and Assas APIs to securely process payments and create subscriptions
2. **Subscription Management:** Implement complete subscription lifecycle management including creation, renewal, upgrades, downgrades, and cancellation
3. **Transaction Tracking:** Build comprehensive transaction logging system with audit trail, status tracking, and detailed metadata
4. **ERP Reconciliation:** Create automated reconciliation system that syncs payment data with ERP for financial reporting
5. **Payment Webhooks:** Implement webhook receivers for real-time payment status updates from both providers

### Secondary Objectives

1. Provide admin dashboard for billing management and transaction visualization
2. Support multiple currencies and automatic currency conversion
3. Implement retry logic for failed transactions
4. Create customer self-service billing portal
5. Generate financial reports and reconciliation statements

### Success Criteria

- All major payment events (creation, renewal, failure, cancellation) are processed within 5 minutes of occurrence
- 99.9% webhook delivery success rate with proper retry mechanisms
- Zero missed reconciliation entries after ERP sync
- Support for both Stripe and Assas with abstracted provider interface
- 100% audit trail coverage for all payment transactions
- Subscription management API supports upgrades/downgrades with prorated billing

---

## Requirements

### Functional Requirements

#### FR1: Payment Provider Integration
- Integrate Stripe API for payment processing and subscription management
- Integrate Assas API for Brazilian market payment processing
- Support provider abstraction layer to switch between providers
- Handle provider-specific API responses and error codes
- Implement secure API key management and credential storage

#### FR2: Subscription Management
- Create subscriptions with configurable billing cycles (monthly, quarterly, annual)
- Support subscription status tracking (active, paused, cancelled, past_due)
- Implement subscription renewal workflows with automatic charge attempts
- Support subscription upgrades/downgrades with prorated billing calculations
- Allow subscription cancellation with optional refund handling
- Track subscription start date, renewal date, and cancellation date

#### FR3: Transaction Tracking
- Log all payment transactions with unique idempotent transaction IDs
- Track transaction status (pending, completed, failed, refunded, disputed)
- Store transaction metadata (amount, currency, provider, customer, subscription)
- Implement transaction search and filtering capabilities
- Generate transaction receipts and confirmation documents
- Maintain complete audit trail with timestamps and user actions

#### FR4: Payment Webhooks
- Implement webhook receiver endpoints for Stripe payment events
- Implement webhook receiver endpoints for Assas payment events
- Handle webhook authentication and signature verification
- Process webhook events asynchronously with message queue
- Implement webhook retry logic for failed processing
- Track webhook delivery status and handle duplicate events

#### FR5: ERP Reconciliation
- Create data synchronization pipeline between payment system and ERP
- Map payment transactions to ERP financial entries
- Implement reconciliation verification and dispute resolution
- Generate reconciliation reports for accounting team
- Support automated daily/weekly reconciliation schedules
- Handle reconciliation exceptions and manual review workflows

#### FR6: Billing API
- Provide REST API endpoints for subscription creation and management
- Support payment processing endpoints for one-time charges
- Implement customer billing history and transaction list endpoints
- Support refund and dispute management endpoints
- Return standardized response format across both payment providers

#### FR7: Data Storage
- Store payment provider IDs and transaction references
- Maintain subscription state and billing metadata
- Store customer payment method information (tokenized)
- Archive completed transactions for historical analysis
- Implement data retention policies per compliance requirements

### Non-Functional Requirements

#### NFR1: Security
- Encrypt sensitive payment data using industry-standard encryption
- Never store full credit card information (PCI DSS compliance)
- Implement API authentication with rate limiting
- Validate all webhook signatures before processing
- Audit all payment-related operations with user/system attribution
- Implement TLS 1.2+ for all external API communications

#### NFR2: Performance
- Process payment events within 100ms of webhook receipt
- Support up to 10,000 transactions per day without degradation
- Database queries for transaction history complete within 500ms
- ERP synchronization completes within 5 minutes for daily batches
- Webhook processing queue supports burst handling (100 events/second)

#### NFR3: Reliability
- Implement comprehensive error handling with meaningful error messages
- Support graceful degradation when payment providers are temporarily unavailable
- Implement transaction retry logic with exponential backoff
- Maintain transaction consistency using database transactions
- Implement health checks for payment provider connectivity

#### NFR4: Usability
- Provide clear error messages for payment failures to end users
- Support webhook testing and simulation in development environment
- Implement transaction search with multiple filter options
- Provide admin dashboard for monitoring payment metrics
- Generate downloadable transaction and reconciliation reports

#### NFR5: Maintainability
- Implement provider abstraction to simplify addition of new providers
- Use dependency injection for payment provider implementations
- Implement comprehensive logging for troubleshooting
- Create clear separation between business logic and provider-specific code
- Document payment flows and integration points

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Application                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    Billing API Layer                         │
│  (REST endpoints for payment & subscription operations)      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Payment Orchestration Layer                      │
│  (Business logic, subscription workflows, reconciliation)    │
└────┬───────────────┬──────────────────┬─────────────────────┘
     │               │                  │
┌────▼──────┐  ┌─────▼─────┐  ┌────────▼────────┐
│   Stripe  │  │  Assas    │  │  ERP Sync       │
│  Provider │  │ Provider  │  │   Service       │
│  Adapter  │  │ Adapter   │  │                 │
└────┬──────┘  └─────┬─────┘  └────────┬────────┘
     │               │                 │
     └───┬───────────┴────────────────┬┘
         │                            │
┌────────▼────────────────┐  ┌────────▼──────────────┐
│  External APIs          │  │  Database Layer       │
│  (Stripe, Assas)        │  │  (SQLite + Drizzle)   │
└─────────────────────────┘  └───────────────────────┘
         │                            │
┌────────▼────────────────┐  ┌────────▼──────────────┐
│  Webhook Receivers      │  │  Data Models:         │
│  (Payment Events)       │  │  - Subscriptions      │
└─────────────────────────┘  │  - Transactions       │
                             │  - Webhooks           │
                             │  - Reconciliation     │
                             └───────────────────────┘
```

### Component Breakdown

**1. Billing API Layer**
- REST endpoints for subscription CRUD operations
- Payment processing endpoints
- Transaction history and reporting
- Webhook event receivers

**2. Payment Orchestration Layer**
- Subscription state machine (active → paused → cancelled)
- Billing cycle management and renewal logic
- Prorated billing calculations
- Retry strategies for failed payments

**3. Provider Adapters**
- Abstract payment provider interface
- Stripe adapter (API v3)
- Assas adapter (v3 API)
- Provider-agnostic response normalization

**4. ERP Integration Service**
- Periodic reconciliation scheduler
- Transaction mapping to ERP entries
- Reconciliation verification and dispute handling
- Report generation

**5. Webhook Processing**
- Signature verification for both providers
- Asynchronous event processing with queue
- Idempotency and duplicate detection
- Retry logic with exponential backoff

### Data Flow

```
1. Subscription Creation:
   Client → Billing API → Orchestration Layer → Provider Adapter → Provider API
                         → Database (save subscription record)

2. Payment Processing:
   Webhook Event → Webhook Receiver → Queue → Event Processor → Orchestration Layer
                                              → Database (update transaction)
                                              → ERP Sync Service

3. Reconciliation:
   Scheduler → ERP Service → Fetch transactions → Map to ERP → Verify → Report
```

---

## Database Schema

### Core Tables

#### `subscriptions`
```
- id (uuid, primary key)
- customer_id (foreign key to customers)
- product_id (foreign key to products)
- provider (enum: stripe, assas)
- provider_subscription_id (string) - External provider subscription ID
- status (enum: active, paused, cancelled, past_due)
- billing_cycle (enum: monthly, quarterly, annual)
- amount (decimal)
- currency (string)
- start_date (timestamp)
- renewal_date (timestamp)
- cancelled_date (timestamp)
- cancellation_reason (string, nullable)
- metadata (json)
- created_at (timestamp)
- updated_at (timestamp)
```

#### `transactions`
```
- id (uuid, primary key)
- subscription_id (foreign key to subscriptions, nullable)
- customer_id (foreign key to customers)
- provider (enum: stripe, assas)
- provider_transaction_id (string) - External provider transaction ID
- type (enum: charge, refund, dispute)
- amount (decimal)
- currency (string)
- status (enum: pending, completed, failed, refunded, disputed)
- payment_method (string)
- description (string)
- error_code (string, nullable)
- error_message (string, nullable)
- receipt_url (string, nullable)
- metadata (json)
- created_at (timestamp)
- updated_at (timestamp)
- processed_at (timestamp, nullable)
```

#### `webhooks`
```
- id (uuid, primary key)
- provider (enum: stripe, assas)
- provider_event_id (string)
- event_type (string)
- status (enum: pending, processed, failed)
- payload (json)
- attempt_count (integer)
- last_error (string, nullable)
- created_at (timestamp)
- processed_at (timestamp, nullable)
- next_retry_at (timestamp, nullable)
```

#### `reconciliation`
```
- id (uuid, primary key)
- period_start (date)
- period_end (date)
- transaction_count (integer)
- transaction_total (decimal)
- erp_matched_count (integer)
- erp_matched_total (decimal)
- discrepancies (json)
- status (enum: pending, completed, failed)
- verified_at (timestamp, nullable)
- created_at (timestamp)
```

### Indexes
- `subscriptions(customer_id, status)`
- `subscriptions(provider_subscription_id)`
- `transactions(customer_id, created_at)`
- `transactions(subscription_id)`
- `transactions(provider_transaction_id)`
- `webhooks(provider_event_id)`
- `webhooks(status, next_retry_at)`

---

## Encryption Strategy

### Sensitive Data Encryption

**Data to Encrypt:**
- Payment method tokens (stored for retry logic)
- Provider API keys and credentials
- Customer PII in transaction records
- Webhook payloads containing sensitive information

**Encryption Method:**
- Use AES-256-GCM for at-rest encryption
- Implement per-record encryption with unique IVs
- Store encryption keys in environment variables (rotate regularly)
- Use separate keys for different data classifications

**Implementation:**
- Implement encryption/decryption middleware for database saves/loads
- Use Drizzle ORM with custom column type for encrypted fields
- Never log unencrypted sensitive data
- Implement key rotation strategy with versioning

### PCI DSS Compliance

**Out of Scope (Handled by Payment Providers):**
- Full credit card information is never stored
- Payment processing is delegated to Stripe and Assas
- Token handling follows provider specifications

**In Scope:**
- Audit logging of all payment operations
- Secure webhook signature verification
- Encrypted storage of payment tokens (if needed for retries)
- Access control to payment data

---

## Migration Strategy

### Database Migrations

```
1. v1.0 - Initial Schema (release 1)
   - Create subscriptions, transactions, webhooks, reconciliation tables
   - Add indexes for common queries
   - Create migration runner script

2. v1.1 - Enhanced Metadata (release 2)
   - Add metadata columns for extensibility
   - Add custom field support for different billing models
```

### Feature Rollout

**Phase 1 (Weeks 1-3):** Core Infrastructure
- Database schema and migrations
- Provider adapter abstraction
- Basic Stripe integration
- Webhook receiver setup

**Phase 2 (Weeks 4-5):** Subscription Management
- Subscription CRUD operations
- Renewal workflow implementation
- Status transition logic
- Prorated billing calculations

**Phase 3 (Weeks 6-7):** ERP Integration
- ERP sync service implementation
- Reconciliation logic
- Error handling and dispute resolution
- Report generation

**Phase 4 (Weeks 8-9):** Assas Integration & Polish
- Assas provider adapter
- Testing and optimization
- Documentation and API specification
- Admin dashboard implementation

---

## Implementation Plan

### Technology Stack

**Payment Processing:**
- Stripe SDK for Node.js (`stripe` package)
- Assas SDK for Node.js (`assasapi` package)

**Data Persistence:**
- SQLite for local data storage
- Drizzle ORM for database layer
- Database migrations with custom runner

**Message Queue:**
- Bull or Redis Queue for webhook event processing
- Enables async processing and retry logic

**API Framework:**
- Express.js for REST endpoints
- Middleware for authentication and validation

**Validation & Testing:**
- Zod for schema validation
- Jest for unit and integration tests
- Webhook simulators in development environment

### Development Milestones

**Week 1-2: Foundation**
- [ ] Database schema design and migrations
- [ ] Payment provider abstraction interface
- [ ] Stripe API client setup and authentication
- [ ] Basic project structure and dependencies

**Week 3-4: Core Features**
- [ ] Subscription creation and storage
- [ ] Payment webhook receiver implementation
- [ ] Transaction logging and querying
- [ ] Basic error handling

**Week 5-6: Advanced Features**
- [ ] Subscription renewal and status transitions
- [ ] Prorated billing calculations
- [ ] Assas provider integration
- [ ] Webhook retry logic

**Week 7-8: ERP Integration**
- [ ] ERP service implementation
- [ ] Reconciliation matching algorithm
- [ ] Discrepancy detection and reporting
- [ ] Admin dashboard for monitoring

**Week 9: Testing & Deployment**
- [ ] Comprehensive testing (unit, integration, end-to-end)
- [ ] Performance testing and optimization
- [ ] Security audit and compliance review
- [ ] Documentation and deployment guides

---

## Dependencies

### Internal Dependencies
- **Database Layer:** Requires SQLite and Drizzle ORM setup
- **Authentication:** Depends on existing API auth middleware
- **Customer Management:** Requires customer entity and relationships
- **Product Catalog:** Requires product definitions for subscription mapping

### External Dependencies
- **Stripe API:** v3, requires API keys and webhook secret
- **Assas API:** v3, requires API keys and webhook secret
- **ERP System:** Requires API/webhook endpoints for financial data sync
- **Email Service:** For payment receipts and notifications (future)

### Third-Party Services
- Stripe (Payment processing)
- Assas (Payment processing - Brazilian market)
- ERP System (Financial integration)

---

## Success Metrics

### Functional Metrics
- **Subscription Success Rate:** 99.5% of subscription creation attempts succeed
- **Payment Processing Time:** 95% of payments processed within 5 minutes
- **Webhook Delivery Rate:** 99.9% of webhook events successfully delivered
- **Reconciliation Accuracy:** 100% of transactions reconciled with ERP within 24 hours

### Technical Metrics
- **API Response Time:** 95th percentile < 200ms
- **Database Query Performance:** 95th percentile < 100ms for transaction queries
- **Error Recovery:** 99% of transient failures automatically recovered within 1 hour
- **Uptime:** 99.9% availability of payment processing service

### Business Metrics
- **Payment Volume:** Support 10,000+ transactions per day
- **Currency Support:** Successfully process transactions in at least 5 major currencies
- **Provider Coverage:** Support 95%+ of target market with available payment methods
- **Cost Efficiency:** Keep payment processing overhead < 5% of transaction value

### Quality Metrics
- **Code Coverage:** 85%+ test coverage for payment processing logic
- **Documentation:** 100% API endpoints documented with examples
- **Security:** 0 security vulnerabilities in critical/high severity categories
- **Compliance:** 100% PCI DSS compliance verification

---

## Risks & Mitigation

### Technical Risks

**Risk 1: Payment Provider API Downtime**
- *Impact:* Cannot process payments, revenue loss
- *Probability:* Low (Stripe/Assas have 99.99% uptime)
- *Mitigation:*
  - Implement graceful degradation to queue payments for retry
  - Monitor provider status and alert team
  - Maintain local transaction log for reconciliation
  - Document manual payment processing procedure

**Risk 2: Webhook Delivery Failures**
- *Impact:* Missed payment events, reconciliation issues
- *Probability:* Medium
- *Mitigation:*
  - Implement webhook retry logic with exponential backoff
  - Monitor webhook delivery metrics
  - Use message queue for reliable event processing
  - Implement periodic reconciliation to catch missed events

**Risk 3: Data Loss/Corruption**
- *Impact:* Financial data inconsistency, audit trail loss
- *Probability:* Low
- *Mitigation:*
  - Implement automated database backups (hourly)
  - Use database transactions for all payment operations
  - Implement data validation and integrity checks
  - Maintain audit logs separate from transaction data

### Business Risks

**Risk 4: Regulatory Non-Compliance**
- *Impact:* Legal liability, service shutdown, fines
- *Probability:* Low (if PCI DSS followed)
- *Mitigation:*
  - Implement PCI DSS compliance from start
  - Never store full credit card information
  - Regular security audits and penetration testing
  - Maintain compliance documentation

**Risk 5: Wrong Billing Amount Charges**
- *Impact:* Customer disputes, refunds, reputation damage
- *Probability:* Medium
- *Mitigation:*
  - Implement comprehensive billing calculation tests
  - Add amount verification before processing
  - Implement prorated billing unit tests
  - Monitor for anomalous transaction amounts

**Risk 6: ERP Reconciliation Failure**
- *Impact:* Financial data inconsistency, accounting issues
- *Probability:* Medium
- *Mitigation:*
  - Implement reconciliation verification with human review
  - Create exception handling for unmatched transactions
  - Maintain detailed reconciliation logs
  - Implement reconciliation rollback capability

### Operational Risks

**Risk 7: Insufficient Monitoring**
- *Impact:* Slow response to payment failures
- *Probability:* Medium
- *Mitigation:*
  - Implement comprehensive logging and alerts
  - Create dashboard for payment metrics
  - Set up critical error notifications
  - Implement health checks for all components

**Risk 8: Provider Integration Complexity**
- *Impact:* Delayed development, integration issues
- *Probability:* Medium
- *Mitigation:*
  - Start with provider adapters in parallel
  - Use provider sandboxes extensively
  - Create comprehensive integration tests
  - Build provider abstraction early

---

## Effort Estimation

### Team Composition
- 1 Senior Backend Engineer (Lead)
- 1 Mid-Level Backend Engineer
- 1 QA Engineer (shared)
- 0.5 DevOps Engineer (shared, for monitoring setup)

### Effort Breakdown

| Component | Estimated Hours | Notes |
|-----------|-----------------|-------|
| Database Schema & Migrations | 16 | Design + implementation |
| Payment Provider Abstraction | 24 | Interface design + base impl |
| Stripe Integration | 32 | API integration + error handling |
| Assas Integration | 28 | API integration + localization |
| Subscription Management | 40 | CRUD + workflows + calculations |
| Webhook Processing | 24 | Receivers + processing + retries |
| ERP Reconciliation | 32 | Sync logic + matching + reporting |
| API Endpoints | 24 | REST endpoints + validation |
| Testing (Unit + Integration) | 56 | 85% coverage target |
| Documentation & Examples | 16 | API docs + integration guide |
| Deployment & Monitoring | 20 | Health checks + alerting |
| **Total** | **312 hours** | **~8 weeks, 2 engineers** |

### Timeline
- **Week 1-2:** Database + Abstraction + Initial Stripe (80 hours)
- **Week 3-4:** Subscription Mgmt + Webhook Processing (64 hours)
- **Week 5-6:** Assas + ERP Reconciliation (60 hours)
- **Week 7-8:** Testing + Documentation + Deployment (56 hours)
- **Week 9:** Buffer for refinement + security audit (20 hours)

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Database schema created and migrations working
- [ ] Provider abstraction interface designed
- [ ] Stripe API client configured with authentication
- [ ] Assas API client configured with authentication
- [ ] Development environment with SQLite setup
- [ ] Basic error handling framework implemented
- [ ] Logging infrastructure configured

### Phase 2: Core Features
- [ ] Subscription CRUD endpoints implemented
- [ ] Subscription stored in database
- [ ] Transaction logging implemented
- [ ] Webhook receivers implemented for both providers
- [ ] Webhook signature verification working
- [ ] Async webhook processing queue setup
- [ ] Basic transaction search endpoint implemented

### Phase 3: Advanced Features
- [ ] Subscription renewal workflow implemented
- [ ] Status transition state machine working
- [ ] Prorated billing calculations tested
- [ ] Upgrade/downgrade functionality implemented
- [ ] Subscription cancellation with cleanup
- [ ] Webhook retry logic with exponential backoff
- [ ] Duplicate event detection working

### Phase 4: Integration
- [ ] ERP sync service fetching transactions
- [ ] Reconciliation matching algorithm implemented
- [ ] Discrepancy detection and reporting
- [ ] Reconciliation verification workflow
- [ ] Admin dashboard for payment monitoring
- [ ] Transaction export/reporting functionality
- [ ] Alert system for failed reconciliations

### Phase 5: Quality & Deployment
- [ ] Unit tests for all business logic (85%+ coverage)
- [ ] Integration tests for provider APIs
- [ ] End-to-end testing with sandbox accounts
- [ ] Performance testing and optimization
- [ ] Security audit completed
- [ ] PCI DSS compliance verified
- [ ] Documentation complete with examples
- [ ] Deployment runbook created
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery procedures tested

---

## Appendices

### A. Glossary

| Term | Definition |
|------|-----------|
| **Subscription** | Recurring billing arrangement between customer and platform |
| **Transaction** | Individual payment event (charge, refund, dispute) |
| **Provider** | Third-party payment processor (Stripe, Assas) |
| **Webhook** | HTTP callback from payment provider to notify of events |
| **Idempotency** | Property of operation producing same result regardless of repetition |
| **Reconciliation** | Process of matching payment data with ERP financial records |
| **Prorated Billing** | Adjusting charges based on partial period of service |
| **PCI DSS** | Payment Card Industry Data Security Standard |

### B. Payment Provider Comparison

| Feature | Stripe | Assas |
|---------|--------|-------|
| **Markets** | Global | Brazil-focused |
| **Currencies** | 135+ | BRL, USD |
| **Subscriptions** | Native support | Native support |
| **Webhooks** | Yes | Yes |
| **API Quality** | Excellent | Good |
| **Documentation** | Comprehensive | Good |
| **Support** | 24/7 | Business hours |
| **Cost** | 2.9% + $0.30 | 2.99% + R$0.99 |

### C. Related Documentation

- [Payment Security Guidelines](../security/payment-security.md)
- [ERP Integration Specification](../integrations/erp-integration.md)
- [API Documentation](../api/billing-api.md)
- [Database Migration Guide](../database/migrations.md)

### D. References

1. Stripe API Documentation: https://stripe.com/docs/api
2. Assas API Documentation: https://assas-dev.readme.io/
3. PCI DSS Compliance Guide: https://www.pcisecuritystandards.org/
4. OAuth 2.0 Specification: https://tools.ietf.org/html/rfc6749
5. JSON Web Token (JWT): https://tools.ietf.org/html/rfc7519

### E. Webhook Event Types

**Stripe Events:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`
- `charge.dispute.created`

**Assas Events:**
- `PAYMENT_CREATED`
- `PAYMENT_UPDATED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_RESTORED`

---

**Document History:**
- v1.0 (2026-03-15): Initial PRD creation with comprehensive feature analysis and planning

