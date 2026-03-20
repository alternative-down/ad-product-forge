# Email Communication Provider

## Overview

Each internal agent gets a dedicated mailbox on the company domain.

The chosen provider is **Migadu**. The runtime direction stays simple:
- inbound email via IMAP
- outbound email via SMTP
- mailbox provisioned on hiring
- mailbox deleted on termination

The email provider connects that mailbox to the agent communication system, so inbound emails become communication messages and the agent can reply using the same interface used by other providers.

**Stack:** `imapflow` (IMAP receive + IDLE), `nodemailer` (SMTP send), `postal-mime` (email parsing)

---

## Provisioning Direction

Mailbox credentials are not entered manually by the hiring requester.
They should be provisioned by the application through the Migadu API during hiring and stored in encrypted agent provider storage.

The communication `accounts` tables continue to represent messaging identity only.
The real IMAP/SMTP credentials belong in encrypted `agent_providers` storage.

## Configuration

```typescript
createEmailProvider({
  id: 'email',                         // provider id
  imap: {
    host: string,                      // e.g. 'imap.migadu.com'
    port: number,                      // 993 (TLS) or 143 (STARTTLS)
    secure: boolean,                   // true for port 993
    user: string,                      // agent's email address
    password: string,                  // mailbox password
  },
  smtp: {
    host: string,                      // e.g. 'smtp.migadu.com'
    port: number,                      // 587 (STARTTLS) or 465 (TLS)
    secure: boolean,                   // true for port 465
    user: string,
    password: string,
  },
})
```

---

## Provider Contract (CommunicationProvider)

### `getAccount()`
Returns:
```typescript
{ externalUserId: string, username: string }
// externalUserId: the agent's email address
// username: the agent's email address
```

### `onMessage(callback)`
- Registers the inbound callback
- The listener is already started when the provider is created
- Uses IMAP IDLE for real-time notification of new messages
- Falls back naturally to reconnecting and scanning unseen messages
- On new email: parses with `postal-mime`, maps to `CommunicationInboundMessage`
- Marks processed messages as `\Seen`
- Skips emails sent by the agent itself (avoid loops)

**Email → CommunicationInboundMessage mapping:**
| Email field | Message field |
|---|---|
| `Message-ID` header | `providerMessageId` |
| Thread root `Message-ID` (via `In-Reply-To`/`References`) | `providerConversationKey` |
| `From` address | `authorExternalId`, `authorUsername` |
| `From` display name | `authorDisplayName` |
| Plain text body (or HTML stripped) | `content` |
| Attachments | `attachments[]` |
| `Date` header | `createdAt` |

**Thread key:** The `providerConversationKey` is resolved from `References`, then `In-Reply-To`, then the message `Message-ID` itself.

### `syncContacts()`
Not implemented initially. Returns empty array. Future: extract unique senders from INBOX.

### `sendMessage(input)`
- If `providerConversationKey` is set: reply to that thread
- Uses `replyToProviderMessageId` as `In-Reply-To` when available
- Uses `providerConversationKey` and `replyToProviderMessageId` to build `References`
- If `contactExternalId` is set: compose new email to that address (starts new thread)
- Sends via SMTP using `nodemailer`
- Returns: `{ providerMessageId, providerConversationKey, conversationName }`

---

## Connection Lifecycle

```
createEmailProvider()
  └─ imapflow: connect + authenticate
  └─ SELECT INBOX
  └─ IDLE loop
       └─ unseen email → parse → callback()
```

SMTP connection is created per-send (stateless). IMAP connection is persistent with auto-reconnect on disconnect.

---

## Error Handling

- IMAP disconnect → reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Auth failure → throw at connection time (fail fast, no retry)
- SMTP send failure → throw (caller handles retry)
- Malformed email → log and skip (don't crash the listener)

---

## Provider Notes

Migadu is the chosen provider because it offers real mailboxes, API mailbox management, and straightforward IMAP/SMTP integration for many agent addresses on the same domain.

This provider document describes the runtime adapter shape, not the provisioning workflow. Provisioning and deletion belong to the hiring and termination flows.

## File Location

```
apps/forge/
  src/
    email-account.ts        ← CommunicationProvider implementation
    email/migadu-manager.ts ← mailbox provisioning and deletion via Migadu API
```

The provider itself (`email-account.ts`) will also be usable standalone inside any agent — same pattern as `discord-account.ts`.

---

## Provider Environment

The Migadu admin credential is loaded from the Forge app env:

```env
MIGADU_API_USER=admin@yourdomain.com
MIGADU_API_KEY=your-api-key
```

The mailbox domain is derived from `MIGADU_API_USER`. IMAP and SMTP hosts stay fixed in code for Migadu.

---

## Out of Scope (for now)

- Multiple IMAP folders (only INBOX)
- OAuth2
- Contact sync from existing mailbox
- HTML email composition (plain text only)
- Email signatures
- Read receipts / seen flags sync
