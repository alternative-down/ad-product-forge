# Provider Email (Migadu)

## Visão Geral

O Forge integra com **Migadu** para permitir que agentes envie e recebam emails reais.

## Arquivo Principal

`apps/forge/src/email/migadu-manager.ts`

## Configuração

```typescript
interface EmailCredentials {
  imap: {
    host: string;       // ex: imap.migadu.com
    port: number;       // ex: 993
    user: string;       // ex: agent@seudominio.com
    password: string;
  };
  smtp: {
    host: string;       // ex: smtp.migadu.com
    port: number;       // ex: 465
    user: string;
    password: string;
  };
  bcc?: string[];       // Emails para архивной cópia
}

const email = createEmailProvider({
  imap: { host: 'imap.migadu.com', port: 993, user: 'agent@domain.com', password: 'xxx' },
  smtp: { host: 'smtp.migadu.com', port: 465, user: 'agent@domain.com', password: 'xxx' },
  bcc: ['archive@domain.com']
});
```

## Criar Provider via API

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "email",
    "credentials": {
      "imap": { "host": "imap.migadu.com", "port": 993, "user": "agent@domain.com", "password": "xxx" },
      "smtp": { "host": "smtp.migadu.com", "port": 465, "user": "agent@domain.com", "password": "xxx" },
      "bcc": ["archive@domain.com"]
    }
  }'
```

## Enviar Email

```typescript
await email.send({
  to: ['user@example.com'],
  cc: ['cc@example.com'],
  bcc: ['bcc@example.com'],
  subject: 'Assunto do Email',
  body: 'Corpo do email em texto plain',
  attachments: [
    {
      name: 'documento.pdf',
      data: new Uint8Array([...]),
      contentType: 'application/pdf'
    }
  ]
});
```

## Receber Emails

```typescript
// Listar emails recentes
const messages = await email.listMessages({
  since: Date.now() - 24 * 60 * 60 * 1000,  // últimas 24h
  limit: 50,
  unreadOnly: false
});

// Formato de mensagem
interface EmailMessage {
  messageId: string;
  conversationKey: string;     // Email do remetente
  conversationName?: string;    // Nome do remetente
  sender: {
    id: string;                 // Email
    name: string;               // Nome
  };
  content: string;              // Corpo do email
  subject: string;
  attachments?: CommunicationFile[];
  timestamp: string;
  provider: 'email';
}
```

## Agent Email Manager

```typescript
// apps/forge/src/email/migadu-manager.ts
interface AgentEmailManager {
  // Provisionar mailbox para agente
  provisionMailbox(input: ProvisionInput): Promise<MailboxConfig>;
  
  // Deletar mailbox
  deleteAgentMailbox(agentId: string): Promise<void>;
  
  // Obter configuração atual
  getMailboxConfig(agentId: string): Promise<MailboxConfig | null>;
}

interface MailboxConfig {
  email: string;                // agent-name@domain.com
  imapHost: string;
  smtpHost: string;
}
```

## Provisionar Mailbox

Cada agente pode ter seu próprio mailbox:

```typescript
// Via API
curl -X POST http://localhost:3000/admin/email/provision \
  -H "Content-Type: application/json" \
  -d '{"agentId": "agent-uuid", "agentName": "Orion"}'

// Resposta
{
  "email": "orion@domain.com",
  "imap": { "host": "imap.migadu.com", "port": 993 },
  "smtp": { "host": "smtp.migadu.com", "port": 465 }
}
```

## Migadu API

```typescript
// apps/forge/src/email/migadu-manager.ts
interface MigaduConfig {
  apiKey: string;
  apiBaseUrl: string;   // https://api.migadu.com
  domain: string;       // seu dominio
}

const migadu = createAgentEmailManager({
  apiKey: 'your-api-key',
  apiBaseUrl: 'https://api.migadu.com',
  domain: 'domain.com'
});

// Criar mailbox
await migadu.provisionMailbox({
  agentId: 'agent-uuid',
  agentName: 'Orion'
});

// Resultado
{
  localPart: 'orion',
  email: 'orion@domain.com',
  imapHost: 'imap.migadu.com',
  smtpHost: 'smtp.migadu.com'
}
```

## Rate Limits

O Migadu pode ter rate limits. Implementar backoff se necessário.

## Boas Práticas

1. **Use BCC para архив** — Mantenha cópia de todos emails
2. **Configure SPF/DKIM** — Para garantir entrega
3. **Monitore mailbox** — Verifique inbox regularmente
4. **Limpe emails antigos** — Evite storage excessivo
5. **Valide emails** — Verifique formato antes de enviar
