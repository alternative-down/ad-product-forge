# Integração Email (Migadu)

## Visão Geral

O Forge integra com Migadu para provisionar e gerenciar mailboxes de agentes.

## Arquivo Principal

`apps/forge/src/email/migadu-manager.ts`

## Configuração

```bash
MIGADU_API_KEY=your-api-key
MIGADU_API_BASE_URL=https://api.migadu.com
MIGADU_DOMAIN=example.com
```

## AgentEmailManager

```typescript
const { createAgentEmailManager } = await import('./email/migadu-manager');

const email = createAgentEmailManager({
  apiKey: process.env.MIGADU_API_KEY!,
  apiBaseUrl: process.env.MIGADU_API_BASE_URL!,
  domain: process.env.MIGADU_DOMAIN!,
});
```

## Provisionar Mailbox

Cada agente pode ter seu próprio mailbox.

```typescript
const mailbox = await email.provisionMailbox({
  agentId: 'agent-uuid',
  agentName: 'Orion',
});

// mailbox = {
//   localPart: 'orion',
//   email: 'orion@example.com',
//   imapHost: 'imap.migadu.com',
//   smtpHost: 'smtp.migadu.com',
// }
```

## Deletar Mailbox

```typescript
await email.deleteAgentMailbox('agent-uuid');
```

## Obter Configuração

```typescript
const config = await email.getMailboxConfig('agent-uuid');

// config = {
//   email: 'orion@example.com',
//   imap: { host: 'imap.migadu.com', port: 993 },
//   smtp: { host: 'smtp.migadu.com', port: 465 },
// }
```

## Provider de Email

```typescript
const emailProvider = createEmailProvider({
  imap: {
    host: 'imap.migadu.com',
    port: 993,
    user: 'orion@example.com',
    password: 'xxx',
  },
  smtp: {
    host: 'smtp.migadu.com',
    port: 465,
    user: 'orion@example.com',
    password: 'xxx',
  },
  bcc: ['archive@example.com'],
});
```

## Usar Provider

```typescript
// Enviar email
await emailProvider.send({
  to: ['recipient@example.com'],
  subject: 'Subject',
  body: 'Email body',
  attachments: [],
});

// Listar emails
const messages = await emailProvider.listMessages({
  since: Date.now() - 24 * 60 * 60 * 1000,
  limit: 50,
});
```
