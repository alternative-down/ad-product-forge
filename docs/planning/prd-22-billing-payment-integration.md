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
2. **Subscription Management** - Create, update, cancel subscriptions
3. **Basic Transaction History** - Log successful payments

### Out of Scope
- Multiple payment providers
- ERP reconciliation
- Admin dashboard
- Refunds & disputes handling
- Advanced error recovery
- Webhook event processing
- PCI compliance details (Stripe handles this)

---

## Data Model

### Subscriptions
```typescript
subscriptions {
  id: UUID
  customer_id: UUID (foreign key)
  stripe_subscription_id: string (Stripe reference)
  product_id: string
  status: 'active' | 'cancelled'
  amount: decimal
  billing_cycle: 'monthly' | 'annual'
  start_date: timestamp
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
  status: 'completed' | 'failed'
  created_at: timestamp
}
```

---

## API Endpoints

### Subscriptions
- `POST /api/billing/subscriptions` — Create subscription
- `GET /api/billing/subscriptions/:id` — Get subscription
- `PUT /api/billing/subscriptions/:id` — Update subscription (cancel)
- `GET /api/billing/subscriptions` — List customer subscriptions

### Transactions
- `GET /api/billing/transactions` — List transactions
- `GET /api/billing/transactions/:id` — Get transaction details

---

## Implementation Notes

### Database
- Use existing Drizzle ORM + LibSQL
- Create tables: `subscriptions`, `transactions`
- Index stripe_subscription_id field

### Stripe Integration
- Use Stripe SDK (`stripe` npm package)
- Store Stripe keys in environment variables
- Create/cancel subscriptions via Stripe API
- Store subscription state locally for reference

### Error Handling
- Log failed payments
- Return meaningful validation errors
- No retry logic needed (Stripe handles this)

### Validation
- Use Zod for request validation
- Required: customer_id, product_id, amount, billing_cycle

---

## Success Criteria
- Subscriptions can be created and cancelled in Stripe
- Transaction history queryable
- Basic error handling for Stripe failures
- Data persists correctly

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
- **Week 1:** Database schema + Stripe SDK setup
- **Week 2:** Subscription CRUD endpoints
- **Week 3:** Transaction logging + testing
- **Week 4:** Documentation

Total: ~25 hours for solo developer

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
