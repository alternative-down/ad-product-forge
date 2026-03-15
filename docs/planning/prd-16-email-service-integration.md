# PRD-16: Email Service Integration

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0
**Responsável:** Communication & Infrastructure Team

---

## 1. Resumo Executivo

### Objetivo Principal
Provisionar email organizacional exclusivo para cada agente, integrando um email service provider selecionado com capacidades completas de SMTP/IMAP, permitindo que agentes enviem e recebam emails como identidades independentes em domínio corporativo.

### Proposta de Valor
1. **Identidade de Marca:** Cada agente tem email @dominio.com, refletindo identidade corporativa
2. **Comunicação Profissional:** Agentes podem participar de fluxos de email empresariais nativamente
3. **Caixa de Entrada Centralizada:** Acesso IMAP completo para sincronizar e processar emails
4. **Integração Sem Atrito:** Funciona com sistemas de email existentes (Gmail, Outlook, etc)
5. **Auditoria e Conformidade:** Logs de todos os emails enviados/recebidos por agente

### Escopo da Feature
- Selecionar e integrar email service provider (SMTP/IMAP)
- Implementar provisionamento automático de email por agente
- Definir configuração de domínio e mapeamento de emails
- Fornecer acesso SMTP para envio de emails
- Fornecer acesso IMAP para sincronização de inbox
- Integrar com sistema de persistência de credenciais (PRD-02)
- Criar ferramentas de agente para leitura/envio de emails
- Implementar sistema de templates de email
- Suportar forwarding e aliases de email por agente

### Não está no Escopo
- Interfaceé UI de gerenciamento de emails (apenas APIs)
- Verificação de autenticidade (DKIM/SPF/DMARC) - Phase 2
- Spam filtering/detecção - Phase 2
- Integração com calendários (apenas email) - Phase 2
- Sincronização bidirecional em tempo real (para Phase 2)
- Criptografia end-to-end de emails - Phase 2

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Communication Module (v1 - suporta Discord, Slack, Email básico)
```
Runtime (createAgent/createForgeAgent)
  ├─ Communication Module
  │  ├─ Store (LibSQL + Drizzle ORM - PRD-02)
  │  │  ├─ 5 tables: accounts, contacts, contact_accounts, conversations, messages
  │  │  ├─ provider_configurations, provider_credentials (PRD-02)
  │  │  └─ [future: email_accounts, email_messages, email_folders]
  │  ├─ Provider Registry
  │  │  ├─ In-memory map: providerId → CommunicationProvider instance
  │  │  └─ Providers initialized from DB (PRD-02)
  │  └─ Agent-facing tools
  │     ├─ sendMessage (para Discord, Slack)
  │     ├─ listConversations
  │     ├─ [future: sendEmail, getEmailFolder, replyEmail]
  │
  └─ Providers (dinâmicos via DB)
     ├─ EmailProvider (IMAP/SMTP) ← THIS PR
     ├─ DiscordProvider (bot token)
     ├─ SlackProvider (webhook URL)
     └─ [future providers]
```

#### Email Provider Current State
- Existe `EmailProvider` básico que usa IMAP/SMTP
- Credenciais hardcoded em ENV (não persisted)
- Sem suporte para provisioning automático de emails
- Sem sistema de caixa de entrada sincronizada

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **ORM:** Drizzle (via PRD-02)
- **Database:** LibSQL (SQLite-compatible)
- **Email Provider Options:**
  - `nodemailer` — SMTP client (já existente?)
  - `imap` — IMAP client (npm package)
  - `mailparser` — Parse email messages

### Dependências Existentes
- `@libsql/client` — Database client
- `drizzle-orm` — ORM (via PRD-02)
- `zod` — Schema validation
- `nodemailer` — SMTP (verificar se já instalado)
- `imap` — IMAP client (adicionar)
- `mailparser` — Email parsing (adicionar)

---

## 3. Requisitos Funcionais

### 3.1 Provisionamento de Email por Agente

**RF-1: Criar email account para novo agente**
- Ao criar agente (PRD-05), sistema automaticamente provisiona email
- Email format: `{agentName}@{dominio.com}`
- Armazenar credenciais SMTP/IMAP em provider_configurations (PRD-02)
- Suportar múltiplos domínios (se necessário)
- Log de criação em auditoria

**RF-2: Configuração de domínio**
- Suportar domínios customizados (não apenas `@dominio.com`)
- Permitir configuração de domínio padrão via ENV
- Permitir overrides por agente
- Validar domínio antes de provisioning

**RF-3: Geração automática de credenciais**
- Gerar senhas fortes e aleatórias para IMAP/SMTP
- Armazenar de forma criptografada (RF-02)
- Disponibilizar para agente em initialization

### 3.2 Acesso SMTP (Envio)

**RF-4: Envio de email via SMTP**
- Agente pode enviar email via tool `sendEmail`
- Parâmetros: `to`, `subject`, `body`, `cc`, `bcc`, `attachments`
- Usa credenciais SMTP armazenadas (decryptadas via PRD-02)
- Validação básica (email válido, destinatário não vazio)
- Retorna `messageId` para rastreamento
- Log de envio em `email_messages` table

**RF-5: Templates de email**
- Sistema de templates com variáveis
- Templates pré-definidos (welcome, alert, report, etc)
- Agente pode usar template ou enviar email livre
- Suportar Handlebars ou similar para template rendering

**RF-6: Formatação HTML/Plain Text**
- Suportar tanto HTML quanto plain text
- Auto-convert HTML para plain text se necessário
- Validação de HTML (XSS prevention)

### 3.3 Acesso IMAP (Recepção)

**RF-7: Sincronização de inbox**
- Implementar daemon que periodicamente (a cada 5-10 min) sincroniza IMAP
- Baixar novos emails e armazená-los em `email_messages`
- Manter estado de leitura/não-leitura
- Suportar múltiplas pastas (INBOX, Sent, Drafts, etc)
- Evitar duplicatas

**RF-8: Acesso a emails recebidos**
- Agente pode chamar tool `getEmailFolder` para listar emails
- Parâmetros: `folder` (default INBOX), `limit`, `offset`, `unreadOnly`
- Retorna: lista com from, subject, date, preview, flags
- Suportar filtering por data, remetente, assunto

**RF-9: Leitura de email completo**
- Agente pode chamar tool `readEmail` com `emailId`
- Retorna: headers completos, corpo (HTML + text), attachments metadata
- Não baixar attachments automaticamente (custo/storage)

**RF-10: Marcar como lido/arquivo/spam**
- Tools para marcar email como lido, arquivo, spam, delete
- Reflete mudanças no IMAP server
- Log em auditoria

### 3.4 Features Avançadas

**RF-11: Reply e Forward**
- Agente pode responder email com `replyEmail(emailId, body, attachments)`
- Agente pode encaminhar com `forwardEmail(emailId, to, body)`
- Manter threading (In-Reply-To header)

**RF-12: Aliases e Forwarding**
- Suportar aliases: `agentname+alias@dominio.com`
- Configurável por agente
- Forwarding automático entre aliases
- Stored em `email_aliases` table

**RF-13: Attachments**
- Suportar envio de attachments via SMTP
- Limite de tamanho: 25MB por email
- Manter metadata de attachments recebidos
- Não armazenar attachment binário, apenas referência + metadata

### 3.5 Integração com Sistema Existente

**RF-14: Integração com provider_configurations (PRD-02)**
- Email credentials armazenadas em `provider_configurations`
- `providerType: 'email'`, `providerId: 'email-{agentId}'`
- Usar criptografia de credenciais (PRD-02)
- Suportar rotação de senhas (RF-02)

**RF-15: Multi-email por agente (futuro)**
- Arquitetura preparada para múltiplos emails por agente
- Cada email é um provider config separado
- Tools aceitam `emailProviderId` opcional (default = email-{agentId})

**RF-16: Integração com Contact System**
- Emails recebidos criavam `contacts` em DB
- Participantes de emails (to, cc, from) sincronizados com `contacts` table
- Conversas de email linkadas via `conversations` table

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Envio de email via SMTP < 2s (incluindo DNS lookup)
- **RNF-2:** Download de email via IMAP < 100ms (para previews)
- **RNF-3:** Sincronização de inbox com 1000 emails < 10s
- **RNF-4:** List emails (getEmailFolder) < 200ms

### 4.2 Segurança
- **RNF-5:** Credenciais SMTP/IMAP sempre criptografadas (PRD-02)
- **RNF-6:** Senhas geradas com mínimo 16 caracteres aleatórios
- **RNF-7:** Validação de headers de email (previne header injection)
- **RNF-8:** Validar endereços de email (RFC 5322)
- **RNF-9:** XSS prevention em body de emails renderizados
- **RNF-10:** Rate limiting de envio: máximo 100 emails por agente por hora

### 4.3 Confiabilidade
- **RNF-11:** Retry policy para envio falhado (3 tentativas, exponential backoff)
- **RNF-12:** IMAP sync resilience (reconectar se falhar)
- **RNF-13:** Dead letter queue para emails não processáveis
- **RNF-14:** Backup de email metadata em caso de falha (não é critical, dados estão no servidor)

### 4.4 Conformidade & Auditoria
- **RNF-15:** Cada email enviado/recebido auditado com timestamp e agentId
- **RNF-16:** Retenção de email logs por mínimo 90 dias
- **RNF-17:** Permitir export de email archive (para compliance)
- **RNF-18:** Não armazenar senhas em logs (sempre masked)

### 4.5 Compatibilidade
- **RNF-19:** Funciona com Gmail, Outlook, ProtonMail, Fastmail, etc (qualquer IMAP/SMTP)
- **RNF-20:** Suporta 2FA se email provider usar app passwords
- **RNF-21:** Backwards compatible com communication module existente

---

## 5. Arquitetura da Solução

### 5.1 Novas Tabelas de Banco de Dados

```sql
-- Email accounts por agente
CREATE TABLE email_accounts (
  id TEXT PRIMARY KEY,                    -- uuid
  agent_id TEXT NOT NULL,
  email_address TEXT NOT NULL UNIQUE,     -- "agent-123@acme.com"
  display_name TEXT,                      -- "Agent 123"
  domain TEXT NOT NULL,                   -- "acme.com"

  -- Association com provider config
  provider_config_id TEXT UNIQUE,         -- FK to provider_configurations.id

  -- Status
  status TEXT NOT NULL,                   -- 'active', 'suspended', 'deleted'
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_email_address (email_address),
  INDEX idx_domain (domain)
);

-- Aliases e forwards de email
CREATE TABLE email_aliases (
  id TEXT PRIMARY KEY,
  email_account_id TEXT NOT NULL,         -- FK to email_accounts.id
  alias_address TEXT NOT NULL UNIQUE,     -- "agent-123+support@acme.com"
  description TEXT,

  forward_enabled BOOLEAN DEFAULT false,  -- auto-forward to main email?
  forward_to TEXT,                        -- email to forward to (if enabled)

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_email_account_id (email_account_id),
  INDEX idx_alias_address (alias_address)
);

-- Emails recebidos/enviados com metadata
CREATE TABLE email_messages (
  id TEXT PRIMARY KEY,                    -- uuid
  email_account_id TEXT NOT NULL,         -- FK to email_accounts.id
  external_message_id TEXT UNIQUE,        -- Message-ID header

  -- Headers
  from_address TEXT NOT NULL,
  to_addresses TEXT,                      -- JSON array de recipients
  cc_addresses TEXT,                      -- JSON array
  bcc_addresses TEXT,                     -- JSON array
  subject TEXT,

  -- Content
  body_html TEXT,
  body_text TEXT,

  -- Metadata
  direction TEXT NOT NULL,                -- 'sent', 'received', 'draft'
  status TEXT NOT NULL,                   -- 'sent', 'pending', 'failed', 'read', 'unread'
  in_reply_to_id TEXT,                    -- parent message ID (for threading)
  thread_id TEXT,                         -- conversation thread

  -- IMAP flags
  flags TEXT,                             -- JSON: ["\\Seen", "\\Flagged", ...]

  -- Attachments metadata (not full binary)
  attachments_count INTEGER DEFAULT 0,
  attachments_json TEXT,                  -- JSON: [{ filename, mimetype, size }]

  -- Synced from IMAP?
  imap_uid INTEGER,                       -- IMAP UID for tracking
  synced_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_email_account_id (email_account_id),
  INDEX idx_direction (direction),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_thread_id (thread_id),
  INDEX idx_external_message_id (external_message_id)
);

-- Attachments (metadata only, no binary storage)
CREATE TABLE email_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,               -- FK to email_messages.id
  filename TEXT NOT NULL,
  mimetype TEXT,
  size_bytes INTEGER,

  -- Storage reference (S3, local, etc) - future
  storage_url TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_message_id (message_id)
);

-- Folders/Labels (INBOX, Sent, Drafts, custom folders)
CREATE TABLE email_folders (
  id TEXT PRIMARY KEY,
  email_account_id TEXT NOT NULL,
  name TEXT NOT NULL,                     -- "INBOX", "Drafts", etc
  folder_type TEXT,                       -- 'inbox', 'sent', 'drafts', 'custom'
  unread_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (email_account_id, name),
  INDEX idx_email_account_id (email_account_id)
);

-- Auditoria de ações em emails
CREATE TABLE email_audit_log (
  id TEXT PRIMARY KEY,
  email_account_id TEXT NOT NULL,
  message_id TEXT,                        -- FK to email_messages.id (nullable)

  action TEXT NOT NULL,                   -- 'sent', 'received', 'marked_read', 'deleted', 'forwarded', etc
  description TEXT,

  agent_id TEXT,
  ip_address TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_email_account_id (email_account_id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_created_at (created_at)
);
```

### 5.2 Estrutura Drizzle ORM

```typescript
// packages/mastra-engine/src/db/schema.ts (append)

import { sqliteTable, text, timestamp, integer, boolean } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export const emailAccounts = sqliteTable('email_accounts', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  agentId: text().notNull(),
  emailAddress: text().notNull().unique(),
  displayName: text(),
  domain: text().notNull(),
  providerConfigId: text().unique(),
  status: text().$type<'active' | 'suspended' | 'deleted'>().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  deletedAt: timestamp(),
}, (table) => ({
  idxAgentId: index().on(table.agentId),
  idxEmailAddress: index().on(table.emailAddress),
  idxDomain: index().on(table.domain),
}));

export const emailAliases = sqliteTable('email_aliases', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  emailAccountId: text().notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  aliasAddress: text().notNull().unique(),
  description: text(),
  forwardEnabled: boolean().default(false),
  forwardTo: text(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxEmailAccountId: index().on(table.emailAccountId),
  idxAliasAddress: index().on(table.aliasAddress),
}));

export const emailMessages = sqliteTable('email_messages', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  emailAccountId: text().notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  externalMessageId: text().unique(),
  fromAddress: text().notNull(),
  toAddresses: text(), // JSON array
  ccAddresses: text(), // JSON array
  bccAddresses: text(), // JSON array
  subject: text(),
  bodyHtml: text(),
  bodyText: text(),
  direction: text().$type<'sent' | 'received' | 'draft'>().notNull(),
  status: text().$type<'sent' | 'pending' | 'failed' | 'read' | 'unread'>().notNull(),
  inReplyToId: text(),
  threadId: text(),
  flags: text(), // JSON
  attachmentsCount: integer().default(0),
  attachmentsJson: text(), // JSON
  imapUid: integer(),
  syncedAt: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxEmailAccountId: index().on(table.emailAccountId),
  idxDirection: index().on(table.direction),
  idxStatus: index().on(table.status),
  idxCreatedAt: index().on(table.createdAt),
  idxThreadId: index().on(table.threadId),
  idxExternalMessageId: index().on(table.externalMessageId),
}));

export const emailAttachments = sqliteTable('email_attachments', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  messageId: text().notNull().references(() => emailMessages.id, { onDelete: 'cascade' }),
  filename: text().notNull(),
  mimetype: text(),
  sizeBytes: integer(),
  storageUrl: text(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxMessageId: index().on(table.messageId),
}));

export const emailFolders = sqliteTable('email_folders', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  emailAccountId: text().notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  folderType: text().$type<'inbox' | 'sent' | 'drafts' | 'custom'>(),
  unreadCount: integer().default(0),
  totalCount: integer().default(0),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  uniqueFolder: uniqueIndex().on(table.emailAccountId, table.name),
  idxEmailAccountId: index().on(table.emailAccountId),
}));

export const emailAuditLog = sqliteTable('email_audit_log', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  emailAccountId: text().notNull().references(() => emailAccounts.id),
  messageId: text(),
  action: text().notNull(),
  description: text(),
  agentId: text(),
  ipAddress: text(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxEmailAccountId: index().on(table.emailAccountId),
  idxAgentId: index().on(table.agentId),
  idxCreatedAt: index().on(table.createdAt),
}));

// Relations
export const emailAccountsRelations = relations(emailAccounts, ({ many }) => ({
  aliases: many(emailAliases),
  messages: many(emailMessages),
  folders: many(emailFolders),
  auditLog: many(emailAuditLog),
}));

export const emailMessagesRelations = relations(emailMessages, ({ many, one }) => ({
  attachments: many(emailAttachments),
  account: one(emailAccounts, {
    fields: [emailMessages.emailAccountId],
    references: [emailAccounts.id],
  }),
}));
```

### 5.3 Email Service Core Module

```typescript
// packages/mastra-engine/src/agent/communication/email-service.ts

import { Transporter } from 'nodemailer';
import { simpleParser } from 'mailparser';
import { ImapFlow } from 'imapflow';
import { db } from '../db';
import {
  emailAccounts,
  emailMessages,
  emailFolders,
  emailAuditLog
} from '../db/schema';
import { encryptSecret, decryptSecret } from './encryption';
import { eq, and, desc, lt } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

type EmailProvider = {
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
  tls?: boolean;
};

export class EmailService {
  private transporter: Transporter;
  private imap: ImapFlow;
  private emailAccountId: string;
  private agentId: string;

  constructor(emailAccountId: string, agentId: string, provider: EmailProvider) {
    this.emailAccountId = emailAccountId;
    this.agentId = agentId;

    // Initialize SMTP transporter
    this.transporter = nodemailer.createTransport({
      host: provider.smtpHost,
      port: provider.smtpPort,
      secure: provider.tls !== false,
      auth: {
        user: provider.username,
        pass: provider.password,
      },
    });

    // Initialize IMAP client
    this.imap = new ImapFlow({
      host: provider.imapHost,
      port: provider.imapPort,
      secure: provider.tls !== false,
      auth: {
        user: provider.username,
        pass: provider.password,
      },
      logger: false,
    });
  }

  /**
   * Send email via SMTP
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    body: string;
    isHtml?: boolean;
    cc?: string[];
    bcc?: string[];
    inReplyTo?: string;
    attachments?: Array<{ filename: string; content: Buffer }>;
  }): Promise<{ messageId: string; status: 'sent' | 'failed'; error?: string }> {
    try {
      // Validate email format
      if (!this.isValidEmail(options.to)) {
        throw new Error(`Invalid recipient email: ${options.to}`);
      }

      const mailOptions = {
        from: (await this.getEmailAccount()).emailAddress,
        to: options.to,
        cc: options.cc?.join(','),
        bcc: options.bcc?.join(','),
        subject: options.subject,
        [options.isHtml ? 'html' : 'text']: options.body,
        inReplyTo: options.inReplyTo,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Store in database
      const messageId = uuid();
      await db.insert(emailMessages).values({
        id: messageId,
        emailAccountId: this.emailAccountId,
        externalMessageId: info.messageId,
        fromAddress: mailOptions.from,
        toAddresses: JSON.stringify([options.to]),
        ccAddresses: options.cc ? JSON.stringify(options.cc) : null,
        bccAddresses: options.bcc ? JSON.stringify(options.bcc) : null,
        subject: options.subject,
        [options.isHtml ? 'bodyHtml' : 'bodyText']: options.body,
        direction: 'sent',
        status: 'sent',
        createdAt: new Date(),
      });

      // Audit log
      await this.auditLog('sent', messageId, `Email sent to ${options.to}`);

      return { messageId: info.messageId, status: 'sent' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.auditLog('sent', null, `Send failed: ${errorMsg}`);
      return { messageId: '', status: 'failed', error: errorMsg };
    }
  }

  /**
   * Get emails from folder (INBOX by default)
   */
  async getEmailFolder(options: {
    folder?: string;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  } = {}): Promise<Array<{
    id: string;
    from: string;
    subject: string;
    date: Date;
    preview: string;
    unread: boolean;
  }>> {
    const folder = options.folder || 'INBOX';
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    try {
      await this.imap.connect();
      const mailbox = await this.imap.openMailbox(folder, { readOnly: true });

      const query = options.unreadOnly ? { unseen: true } : {};
      const messages = await this.imap.search(query, {
        all: true,
      });

      // Fetch latest messages
      const uids = messages.slice(-offset - limit, -offset).reverse();
      const result = [];

      for (const uid of uids) {
        const message = await this.imap.fetchOne(uid, { source: true });
        const parsed = await simpleParser(message.source);

        result.push({
          id: uid.toString(),
          from: parsed.from?.text || '',
          subject: parsed.subject || '(no subject)',
          date: parsed.date || new Date(),
          preview: parsed.text?.substring(0, 100) || '',
          unread: !message.flags.includes('\\Seen'),
        });
      }

      await this.imap.close();
      return result;
    } catch (error) {
      console.error('Failed to get email folder:', error);
      throw error;
    }
  }

  /**
   * Read full email by ID
   */
  async readEmail(emailId: string): Promise<{
    from: string;
    to: string[];
    cc: string[];
    subject: string;
    bodyHtml: string;
    bodyText: string;
    attachments: Array<{ filename: string; mimetype: string; size: number }>;
  }> {
    const message = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.id, emailId))
      .limit(1);

    if (!message.length) {
      throw new Error(`Email not found: ${emailId}`);
    }

    const msg = message[0];
    const attachments = msg.attachmentsJson
      ? JSON.parse(msg.attachmentsJson)
      : [];

    return {
      from: msg.fromAddress,
      to: msg.toAddresses ? JSON.parse(msg.toAddresses) : [],
      cc: msg.ccAddresses ? JSON.parse(msg.ccAddresses) : [],
      subject: msg.subject || '',
      bodyHtml: msg.bodyHtml || '',
      bodyText: msg.bodyText || '',
      attachments,
    };
  }

  /**
   * Mark email as read
   */
  async markAsRead(emailId: string): Promise<void> {
    await db
      .update(emailMessages)
      .set({ status: 'read', flags: JSON.stringify(['\\Seen']) })
      .where(eq(emailMessages.id, emailId));

    await this.auditLog('marked_read', emailId, 'Email marked as read');
  }

  /**
   * Delete email
   */
  async deleteEmail(emailId: string): Promise<void> {
    await db
      .update(emailMessages)
      .set({ status: 'deleted' })
      .where(eq(emailMessages.id, emailId));

    await this.auditLog('deleted', emailId, 'Email deleted');
  }

  /**
   * Sync emails from IMAP (background job)
   */
  async syncFromImap(): Promise<void> {
    try {
      await this.imap.connect();

      // Get or create INBOX folder
      const mailbox = await this.imap.openMailbox('INBOX');

      // Get new messages since last sync
      const messages = await this.imap.search({ all: true });

      for (const uid of messages) {
        const message = await this.imap.fetchOne(uid, { source: true, envelope: true });

        // Check if already synced
        const existing = await db
          .select()
          .from(emailMessages)
          .where(
            and(
              eq(emailMessages.emailAccountId, this.emailAccountId),
              eq(emailMessages.imapUid, uid)
            )
          );

        if (existing.length) continue; // Already synced

        // Parse email
        const parsed = await simpleParser(message.source);

        // Store in database
        await db.insert(emailMessages).values({
          id: uuid(),
          emailAccountId: this.emailAccountId,
          externalMessageId: parsed.messageId,
          fromAddress: parsed.from?.text || '',
          toAddresses: JSON.stringify(
            message.envelope.to?.map(addr => `${addr.mailbox}@${addr.host}`) || []
          ),
          subject: parsed.subject || '',
          bodyHtml: parsed.html || null,
          bodyText: parsed.text || null,
          direction: 'received',
          status: message.flags.includes('\\Seen') ? 'read' : 'unread',
          imapUid: uid,
          flags: JSON.stringify(message.flags),
          syncedAt: new Date(),
          createdAt: new Date(),
        });
      }

      await this.imap.close();
      await this.auditLog('synced', null, `Synced ${messages.length} emails`);
    } catch (error) {
      console.error('IMAP sync failed:', error);
      throw error;
    }
  }

  // Private helpers
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async getEmailAccount() {
    const account = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.id, this.emailAccountId))
      .limit(1);

    if (!account.length) {
      throw new Error(`Email account not found: ${this.emailAccountId}`);
    }

    return account[0];
  }

  private async auditLog(action: string, messageId: string | null, description: string) {
    await db.insert(emailAuditLog).values({
      id: uuid(),
      emailAccountId: this.emailAccountId,
      messageId,
      action,
      description,
      agentId: this.agentId,
      createdAt: new Date(),
    });
  }
}
```

### 5.4 Email Provisioning Service

```typescript
// packages/mastra-engine/src/agent/communication/email-provisioning.ts

import { db } from '../db';
import { emailAccounts } from '../db/schema';
import { registerProviderConfig } from './provider-config';
import { v4 as uuid } from 'uuid';
import crypto from 'node:crypto';

export async function provisionEmailForAgent(
  agentId: string,
  agentName: string,
  domain: string = process.env.EMAIL_DOMAIN || 'agents.company.com'
): Promise<{
  emailAccountId: string;
  emailAddress: string;
  providerConfigId: string;
}> {
  // Email address format
  const emailAddress = `${agentName}@${domain}`;

  // Generate strong random password
  const smtpPassword = crypto.randomBytes(24).toString('base64');
  const imapPassword = crypto.randomBytes(24).toString('base64');

  // Get email provider configuration from ENV
  const emailProvider = {
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587'),
    imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
    imapPort: parseInt(process.env.IMAP_PORT || '993'),
    username: process.env.EMAIL_ADMIN_USERNAME || '',
    domain,
  };

  if (!emailProvider.username) {
    throw new Error('EMAIL_ADMIN_USERNAME not configured');
  }

  // 1. Create email account record
  const emailAccountId = uuid();
  await db.insert(emailAccounts).values({
    id: emailAccountId,
    agentId,
    emailAddress,
    domain,
    displayName: agentName,
    status: 'active',
    createdAt: new Date(),
  });

  // 2. Register with provider system (PRD-02)
  const { configId: providerConfigId } = await registerProviderConfig(db, {
    agentId,
    providerId: `email-${agentId}`,
    providerType: 'email',
    configJson: {
      imap: {
        host: emailProvider.imapHost,
        port: emailProvider.imapPort,
        secure: true,
      },
      smtp: {
        host: emailProvider.smtpHost,
        port: emailProvider.smtpPort,
        secure: emailProvider.smtpPort === 465,
      },
      emailAddress,
    },
    secrets: {
      smtpPassword,
      imapPassword,
    },
  });

  // Update email_accounts with provider config reference
  await db
    .update(emailAccounts)
    .set({ providerConfigId })
    .where(eq(emailAccounts.id, emailAccountId));

  return {
    emailAccountId,
    emailAddress,
    providerConfigId,
  };
}

export async function deprovisionEmailForAgent(agentId: string): Promise<void> {
  const accounts = await db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.agentId, agentId));

  for (const account of accounts) {
    await db
      .update(emailAccounts)
      .set({ status: 'deleted', deletedAt: new Date() })
      .where(eq(emailAccounts.id, account.id));
  }
}
```

---

## 6. Plano de Implementação

### Fase 1: Infraestrutura de Banco de Dados (Sprint 1 - 1 semana)
- [ ] Definir schema Drizzle para 6 novas tabelas
- [ ] Criar migrations (Drizzle ou SQL)
- [ ] Setup de índices para performance
- [ ] Testes de schema (constraints, relationships)
- [ ] Testes de capacidade (1000 emails per account)

### Fase 2: Email Service Core (Sprint 2 - 1,5 semanas)
- [ ] Implementar EmailService class (SMTP + IMAP)
- [ ] `sendEmail()` com validação
- [ ] `getEmailFolder()` com caching
- [ ] `readEmail()` com parsing
- [ ] `markAsRead()`, `deleteEmail()`
- [ ] Testes unitários (mocking SMTP/IMAP)

### Fase 3: Provisioning & Integration (Sprint 3 - 1,5 semanas)
- [ ] Implementar `provisionEmailForAgent()`
- [ ] Integrar com `registerProviderConfig()` (PRD-02)
- [ ] Integrar com `createAgent()` para auto-provisioning
- [ ] Implementar `deprovisionEmailForAgent()`
- [ ] Testes de provisioning

### Fase 4: Email Sync Daemon (Sprint 4 - 1 semana)
- [ ] Implementar `syncFromImap()` (background job)
- [ ] Setup cron job (executa a cada 5 min)
- [ ] Testes de sincronização com múltiplas contas
- [ ] Performance testing (1000+ emails)

### Fase 5: Agent Tools (Sprint 5 - 1 semana)
- [ ] Criar agent tool `sendEmail`
- [ ] Criar agent tool `getEmailFolder`
- [ ] Criar agent tool `readEmail`
- [ ] Criar agent tool `markAsRead`
- [ ] Criar agent tool `deleteEmail`
- [ ] Testes E2E com agent real

### Fase 6: Validação & Rollout (Sprint 6 - 5 dias)
- [ ] Testes end-to-end completos
- [ ] Performance benchmarking
- [ ] Documentação de API
- [ ] Documentação de setup
- [ ] Testing com provedores reais (Gmail, Outlook)

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| Falha de IMAP sync deixa emails perdidos | Média | Alto | Dead letter queue + retry logic com exponential backoff |
| Problema de rate limiting de SMTP | Média | Médio | Implementar queue + throttling (max 100 emails/hora) |
| Credenciais SMTP/IMAP comprometidas | Baixa | CRÍTICO | Criptografia via PRD-02, masking em logs |
| Performance de sincronização degrada | Média | Médio | Índices no DB + batching de processamento |
| Incompatibilidade com diferentes email providers | Média | Alto | Testar com Gmail, Outlook, ProtonMail, Fastmail cedo |
| Limites de armazenamento (banco de dados cresce) | Média | Médio | Implementar retention policy (arquivar >90 dias) |
| Parsing de email falha para alguns formatos | Baixa | Médio | Fallback para plaintext, logging de erros |
| Emails duplicados em sincronização | Baixa | Médio | Usar IMAP UID + unique constraint em DB |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] Todas as 6 tabelas criadas e indexadas
- [ ] EmailService class com 100% test coverage
- [ ] Sincronização IMAP: < 2 segundos para 100 emails novos
- [ ] SMTP send: < 2 segundos por email
- [ ] Database queries: < 200ms (com índices)
- [ ] 0 emails perdidos em sincronização (rastreados via IMAP UID)
- [ ] Suporta 1000+ emails por agente sem degradação

### Funcionais
- [ ] Agentes podem enviar emails com `sendEmail()`
- [ ] Agentes podem ler inbox com `getEmailFolder()`
- [ ] Agentes podem ler email completo com `readEmail()`
- [ ] Emails recebidos sincronizados automaticamente
- [ ] Múltiplos agentes com emails diferentes
- [ ] Auditoria completa de envios/recebimentos

### de Negócio
- [ ] Agentes têm identidade profissional (@dominio.com)
- [ ] Suporta workflows de email empresariais
- [ ] Reduz necessidade de integração com email externo
- [ ] Conformidade: logs auditáveis por 90 dias

---

## 9. Dependências Externas

### Internas
- PRD-02: Communication Provider Integration (persistência de credenciais)
- PRD-05: Agent Hiring Workflow (auto-provisioning na criação)
- Communication Module existente
- Drizzle ORM (via PRD-02)

### Externas (npm packages)
- `nodemailer` — SMTP client
- `imap` — IMAP client (npm: `imapflow` recomendado)
- `mailparser` — Parse email messages
- `uuid` — Gerar IDs

### Email Providers (suportados)
- Gmail (com app passwords)
- Outlook/Microsoft Exchange
- ProtonMail (com Bridge)
- Fastmail
- Qualquer IMAP/SMTP provider

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~120-150 horas (6 sprints de 1 semana cada)

### Breakdown por Fase
1. **Phase 1 (Database):** 15h (schema, migrations, testes)
2. **Phase 2 (EmailService):** 25h (SMTP, IMAP, tools)
3. **Phase 3 (Provisioning):** 20h (auto-provision, integration)
4. **Phase 4 (Sync):** 18h (daemon, IMAP sync)
5. **Phase 5 (Agent Tools):** 22h (5 tools + testes)
6. **Phase 6 (Validation):** 15h (E2E, docs, rollout)

### Story Points (Fibonacci)
- [ ] Epic PRD-16: 55 story points (6 sprints, pode ser paralelo com outras features)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/email-service-setup.md` — Setup de dependências
2. `docs/implementation/email-schema.md` — Schema Drizzle detalhado
3. `docs/implementation/email-provisioning-api.md` — API de provisioning
4. `docs/implementation/email-service-api.md` — EmailService class reference
5. `docs/implementation/imap-sync-daemon.md` — Setup de background job

### Para Operadores
1. `docs/operations/email-provider-setup.md` — Como configurar Gmail/Outlook
2. `docs/operations/email-troubleshooting.md` — Debugging de problemas
3. `docs/operations/email-retention.md` — Política de retenção

### Para Usuários (Agentes)
1. `docs/agents/email-tools.md` — Como usar email tools
2. `docs/agents/email-best-practices.md` — Boas práticas

---

## 12. Critérios de Aceitação

- [ ] Schema de 6 tabelas criado e testado
- [ ] EmailService class implementada (SMTP + IMAP)
- [ ] Provisioning automático funciona em agent creation
- [ ] 5 agent tools funcionando (sendEmail, getEmailFolder, etc)
- [ ] IMAP sync daemon rodando a cada 5 minutos
- [ ] Performance < 2s para SMTP send
- [ ] Performance < 2s para IMAP sync de 100 emails
- [ ] 0 emails perdidos (IMAP UID tracking)
- [ ] Testes E2E com múltiplos agentes
- [ ] Auditoria completa de todas as ações
- [ ] Documentação completa (dev + ops)
- [ ] Backwards compatible com communication module existente
- [ ] Suportado Gmail, Outlook, Fastmail (3 providers)

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Validar dependências:** Verificar se `nodemailer`, `mailparser`, `imapflow` são as melhores opções
2. **Selecionar email provider:** Decidir se usar Gmail organizacional, ou separado
3. **Planejar domínio:** Qual domínio usar para emails de agentes
4. **Criptografia:** Confirmar que PRD-02 (criptografia de credenciais) está pronto
5. **Priorização:** Validar se Phase 4 (IMAP sync daemon) é prioridade ou pode ser Phase 2

### Após Phase 1 (Database)
1. **Benchmark:** Rodar testes de performance com 10k emails
2. **Drizzle migrations:** Confirmar que migrations funcionam em produção

### Após Phase 4 (Email Sync)
1. **Verificação de autenticidade:** Implementar DKIM/SPF/DMARC validation (Phase 2)
2. **Spam filtering:** Adicionar spam detection básico (Phase 2)
3. **Full-text search:** Índices para busca em emails (Phase 2)

### Longo Prazo
1. Integração com calendários (Phase 3)
2. Criptografia end-to-end (Phase 3)
3. Dashboard web de email (Phase 4)
4. Integração com webhooks (notificação de novos emails)
5. Export/archival automático para compliance

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após Phase 1 (validação de schema)

---

## Apêndice A: Exemplo de Uso End-to-End

### Scenario: Criar agente com email e enviar mensagem

```typescript
// 1. Criar agente (integrado com PRD-05)
const agent = await createForgeAgent({
  agentId: 'researcher-01',
  name: 'Research Agent',
  // Email é auto-provisionado!
});

// 2. Sistema automaticamente:
// - Cria email: researcher-01@acme.com
// - Provisiona SMTP/IMAP credentials
// - Armazena credenciais criptografadas (PRD-02)

// 3. Agent pode enviar email
const result = await agent.tools.sendEmail({
  to: 'client@external.com',
  subject: 'Research Report',
  body: '<h1>Report</h1><p>Findings...</p>',
  isHtml: true,
});
// → Email enviado como researcher-01@acme.com

// 4. Agent pode ler inbox
const emails = await agent.tools.getEmailFolder({
  folder: 'INBOX',
  limit: 20,
  unreadOnly: true,
});

// 5. Agent pode ler email completo
const fullEmail = await agent.tools.readEmail({
  emailId: 'msg-123',
});

// 6. Agent pode responder
const reply = await agent.tools.replyEmail({
  emailId: 'msg-123',
  body: 'Thanks for the feedback!',
});

// 7. Background: IMAP sync executa a cada 5 min
// - Sincroniza novos emails
// - Armazena em email_messages
// - Atualiza unread count
```

---

**FIM DO DOCUMENTO**
