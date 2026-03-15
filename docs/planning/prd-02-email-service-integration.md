# PRD-16: Email Service Integration (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes email communication infrastructure specific to ad-product-forge.** While email is a general communication medium, this specific implementation is tailored to Nicolas' agents' use cases (customer outreach, team communication, notifications). The communication provider system (PRD-02) is framework-level; this is the application-specific email integration.

### Objective
Enable agents to send and receive emails using standard IMAP/SMTP providers.

### Value (for ad-product-forge)
- Nicolas' agents can send emails to customers and team members
- Agents can read inbox for customer inquiries and feedback
- Works with Gmail, Outlook, Fastmail
- Simple, no corporate features

---

## 2. Scope

### Included
- Send emails via SMTP
- Read inbox via IMAP
- Agent tools: `sendEmail()`, `getInbox()`, `readEmail()`
- Store credentials (via PRD-02)
- Basic logging

### Not Included
- Email provisioning
- Continuous sync
- Custom domains
- Templates
- Forwarding/aliases
- DKIM/SPF/DMARC
- Attachments
- Multiple emails per agent
- Email UI

---

## 3. Requirements

### RF-1: sendEmail Tool
```typescript
interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

// Returns: { success: boolean, error?: string }
```

### RF-2: getInbox Tool
```typescript
interface GetInboxParams {
  limit?: number; // default 10
}

// Returns: Array<{
//   id: string;
//   from: string;
//   subject: string;
//   date: Date;
// }>
```

### RF-3: readEmail Tool
```typescript
interface ReadEmailParams {
  id: string;
}

// Returns: { body: string }
```

### RF-4: Store Email Configuration
- Email address, SMTP/IMAP credentials
- Via provider_configurations (PRD-02)

---

## 4. Database

None needed. No logging required for solo dev.

---

## 5. Implementation

### Phase 1: Email Service Wrapper (6h)
- Create email service with sendEmail(), getInbox(), readEmail()
- Basic error handling

### Phase 2: Agent Tools (3h)
- Wire 3 tools to agent executor

---

## 6. Success Criteria
- [ ] Agents can send emails
- [ ] Agents can read inbox (latest 10)
- [ ] Agents can read email body
- [ ] Works with Gmail/Outlook

---

## 7. Effort
- **Total: ~9 hours**

---

## 8. Dependencies
- PRD-02: Provider configuration system
- `nodemailer` — SMTP
- `imapflow` — IMAP (alternative: `imap` npm package)

---

**End of document**
