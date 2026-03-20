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
- Opens an IMAP connection to INBOX
- Uses IMAP IDLE for real-time notification of new messages
- Falls back to polling every 60s if IDLE not supported
- On new email: parses with `postal-mime`, maps to `CommunicationInboundMessage`
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

**Thread key:** The `providerConversationKey` is the `Message-ID` of the first email in the thread. Resolved by walking the `References` header chain — if empty, the email itself is the root (new conversation).

### `syncContacts()`
Not implemented initially. Returns empty array. Future: extract unique senders from INBOX.

### `sendMessage(input)`
- If `providerConversationKey` is set: reply to that thread (sets `In-Reply-To` and `References` headers)
- If `contactExternalId` is set: compose new email to that address (starts new thread)
- Sends via SMTP using `nodemailer`
- Returns: `{ providerMessageId, providerConversationKey }`

---

## Connection Lifecycle

```
createEmailProvider()
  └─ [lazy] onMessage() called
       └─ imapflow: connect + authenticate
       └─ SELECT INBOX
       └─ IDLE loop (or poll fallback)
            └─ new email → parse → callback()
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
apps/
  forge-email/          ← new app (mirrors forge-discord structure)
    src/
      email-account.ts  ← CommunicationProvider implementation
      main.ts           ← agent setup + env config
      forge-system.md   ← system prompt for the email agent
    .env.example
    package.json
    tsconfig.json
```

The provider itself (`email-account.ts`) will also be usable standalone inside any agent — same pattern as `discord-account.ts`.

---

## Environment Variables (.env.example)

```
FORGE_AGENT_ID=forge-email
FORGE_AGENT_NAME=Forge Email Agent
FORGE_MODEL_PROVIDER=claude-max
FORGE_MODEL_ID=claude-opus-4-5

IMAP_HOST=imap.migadu.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=agent@yourdomain.com
IMAP_PASSWORD=your-mailbox-password

SMTP_HOST=smtp.migadu.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=agent@yourdomain.com
SMTP_PASSWORD=your-mailbox-password
```

---

## Out of Scope (for now)

- Multiple IMAP folders (only INBOX)
- OAuth2
- Contact sync from existing mailbox
- HTML email composition (plain text only)
- Email signatures
- Read receipts / seen flags sync
