# PRD-18: Marketing Platform Integration (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Objective
Enable agents to send emails via marketing platforms (like Mailchimp).

### Value
- Agents can send bulk emails via Mailchimp
- Simple integration, no campaign management

---

## 2. Scope

### Included (if implemented)
- Send email via Mailchimp API
- Store Mailchimp credentials
- Basic error handling

### Not Included
- Campaign creation/management
- Audience management
- A/B testing
- Analytics
- Multiple platforms
- Workflows
- Customer journey automation
- UI dashboard

---

## 3. Minimal Requirements

### RF-1: sendEmailViaMailchimp Tool
```typescript
interface SendEmailViaMailchimpParams {
  to: string[];
  subject: string;
  body: string;
}

// Returns: { campaignId: string, status: string } | { error: string }
```

### RF-2: Store Mailchimp API Key
- Via provider_configurations (PRD-02)
- Secured

---

## 4. Implementation

### Phase 1: Mailchimp Integration (4h)
- Use Mailchimp API
- Implement `sendEmailViaMailchimp()` tool
- Error handling

---

## 5. Success Criteria
- [ ] Agent can send email via Mailchimp
- [ ] Credentials stored securely
- [ ] Basic error handling

---

## 6. Status
**Deferred** - Low priority. Use PRD-16 (simple email) instead unless bulk email needed.

---

## 7. Effort
- Phase 1: ~4 hours (if implemented)

---

**End of document**
