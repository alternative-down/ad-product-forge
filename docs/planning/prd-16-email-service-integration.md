# PRD-16: Email Service Integration (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Objective
Enable agents to send and receive emails using standard IMAP/SMTP providers.

### Value
- Agents can send emails
- Agents can read inbox
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

// Returns: { status: 'sent' | 'failed', error?: string }
```

### RF-2: getInbox Tool
```typescript
interface GetInboxParams {
  limit?: number; // default 20
}

// Returns: Array<{
//   id: string;
//   from: string;
//   subject: string;
//   date: Date;
//   preview: string;
// }>
```

### RF-3: readEmail Tool
```typescript
interface ReadEmailParams {
  id: string;
}

// Returns: {
//   from: string;
//   subject: string;
//   body: string;
//   date: Date;
// }
```

### RF-4: Store Email Configuration
- Email address, SMTP host, IMAP host
- Username, password
- Via provider_configurations (PRD-02)

### RF-5: Basic Logging
- Store sent emails in log table
- Log: agent_id, to, subject, status, timestamp

---

## 4. Database

```sql
CREATE TABLE email_sent_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT,

  INDEX idx_agent_id (agent_id),
  INDEX idx_sent_at (sent_at)
);
```

---

## 5. Implementation

### Phase 1: Email Service Class
- SMTP/IMAP client wrapper
- sendEmail(), getInbox(), readEmail()
- Error handling, basic retry

### Phase 2: Agent Tools
- Create 3 tools: sendEmail, getInbox, readEmail
- Integrate with agent executor

### Phase 3: Testing
- Unit tests with mocked SMTP/IMAP
- Integration test with real email provider

---

## 6. Success Criteria
- [ ] Agents can send emails
- [ ] Agents can read inbox
- [ ] Agents can read specific emails
- [ ] Works with Gmail/Outlook
- [ ] Credentials stored securely
- [ ] Basic logging works

---

## 7. Effort
- Phase 1: 8h (email service)
- Phase 2: 4h (agent tools)
- Phase 3: 4h (testing)
- **Total: ~16 hours**

---

## 8. Dependencies
- PRD-02: Provider configuration system
- `nodemailer` — SMTP
- `imapflow` — IMAP (alternative: `imap` npm package)

---

**End of document**
