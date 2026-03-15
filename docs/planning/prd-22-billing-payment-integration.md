# PRD 22: Billing & Payment Integration

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Goal
Implement basic payment processing for subscriptions using Stripe, enabling the platform to accept payments and manage subscription lifecycles.

### Core Features
1. **Stripe Integration** - Process payments and manage subscriptions
2. **Webhook Handling** - Handle payment events from Stripe
3. **Transaction Logging** - Track payment history
4. **Subscription Management** - Create, update, cancel subscriptions

### Out of Scope
- Multiple payment providers (Assas, etc.)
- ERP reconciliation
- Admin dashboard
- Advanced retry logic
- Multi-currency support
- Refunds & disputes
- PCI compliance details

---

## Data Model

### Subscriptions
```typescript
subscriptions {
  id: UUID
  customer_id: UUID (foreign key)
  stripe_subscription_id: string (Stripe reference)
  product_id: string
  status: 'active' | 'paused' | 'cancelled'
  amount: decimal
  currency: string (default 'USD')
  billing_cycle: 'monthly' | 'annual'
  start_date: timestamp
  renewal_date: timestamp
  cancelled_date: timestamp (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

### Transactions
```typescript
transactions {
  id: UUID
  subscription_id: UUID (foreign key, optional)
  customer_id: UUID (foreign key)
  stripe_payment_id: string (Stripe reference)
  amount: decimal
  currency: string
  status: 'pending' | 'completed' | 'failed'
  description: string (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

### Webhooks (for logging)
```typescript
webhook_events {
  id: UUID
  stripe_event_id: string (Stripe reference)
  event_type: string (e.g., 'charge.succeeded')
  status: 'processed' | 'failed'
  payload: JSON
  processed_at: timestamp (optional)
  created_at: timestamp
}
```

---

## API Endpoints

### Subscriptions
- `POST /api/billing/subscriptions` — Create subscription
- `GET /api/billing/subscriptions/:id` — Get subscription
- `PUT /api/billing/subscriptions/:id` — Update subscription
- `DELETE /api/billing/subscriptions/:id` — Cancel subscription
- `GET /api/billing/subscriptions` — List customer subscriptions

### Transactions
- `GET /api/billing/transactions` — List transactions
- `GET /api/billing/transactions/:id` — Get transaction details

### Webhooks
- `POST /api/billing/webhooks/stripe` — Stripe webhook receiver

---

## Implementation Notes

### Database
- Use existing Drizzle ORM + LibSQL
- Create tables: `subscriptions`, `transactions`, `webhook_events`
- Index stripe_*_id fields for quick lookups

### Stripe Integration
- Use Stripe SDK (`stripe` npm package)
- Store Stripe keys in environment variables
- Create subscriptions via Stripe API
- Handle webhook events asynchronously

### Webhook Processing
- Verify Stripe webhook signatures (critical for security)
- Process these events: `charge.succeeded`, `customer.subscription.created`, `customer.subscription.deleted`
- Log all events for debugging
- Simple in-memory queue or async handlers (no external queue system)

### Error Handling
- Failed payments logged but not retried automatically
- Webhook failures logged with basic retry (e.g., respond 500 to Stripe to retry)
- Validation errors returned to caller

### Validation
- Use Zod for request validation
- Required: customer_id, product_id, amount, billing_cycle

---

## Success Criteria
- Subscriptions can be created/updated/cancelled in Stripe
- Webhook events processed and stored
- Transaction history queryable
- No crashes on webhook failures

---

## Security Considerations
- Verify Stripe webhook signatures (non-negotiable)
- Never log full credit card info (Stripe handles this)
- Use HTTPS for all API calls
- Store Stripe keys in environment variables only

---

## Dependencies
- Stripe SDK
- Drizzle ORM (existing)
- LibSQL (existing)
- Zod (existing)

---

## Timeline
- **Week 1:** Database schema + Stripe setup
- **Week 2:** Subscription endpoints
- **Week 3:** Webhook handling + testing
- **Week 4:** Documentation + edge cases

Total: ~35 hours for solo developer

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
