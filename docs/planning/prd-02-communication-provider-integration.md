# PRD 02: Communication Provider Integration

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0

> **Note:** Este é um projeto pessoal de desenvolvedor solo. Requisitos focam em funcionalidade, não robustez corporativa.

---

## Resumo Executivo

### Objetivo Principal
Persistir, gerenciar e criptografar credenciais de provedores de comunicação (email, Discord, Slack, etc.) em banco de dados centralizado, permitindo que múltiplos agentes utilizem múltiplos provedores simultamente com configuração dinâmica e segura.

### Proposta de Valor
1. **Segurança:** Credenciais criptografadas e isoladas por agente
2. **Escalabilidade:** Suportar N agentes × M provedores sem limites hardcoded
3. **Dinamismo:** Adicionar/remover provedores sem redeployed código
4. **Manutenibilidade:** Migração de raw SQL (LibSQL Client) para Drizzle ORM para melhor type-safety e auditoria

### Escopo da Feature
- Criar tabelas de banco de dados para armazenar credenciais de providers
- Implementar criptografia de credenciais sensíveis (IMAP/SMTP passwords, tokens, API keys)
- Migrar módulo de comunicação de SQLClient direto para Drizzle ORM
- Persistir configurações de provider por agente
- Suportar múltiplos provedores por agente
- Versionamento de credenciais para auditoria
- Revogar/reatualizar credenciais sem cortar fluxo ativo

### Não está no Escopo
- Integração com OAuth2/OIDC (nice-to-have futura)
- Interface UI de gerenciamento de providers
- Sincronização entre múltiplas instâncias
- Backup/restore automatizado
- Secret management services externos (AWS Secrets Manager, Vault)

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Communication Module (v1 - sem persistência de credenciais)
```
Runtime (createAgent/createForgeAgent)
  ├─ Communication Module
  │  ├─ Store (LibSQL + raw SQL Client)
  │  │  ├─ 5 tables: accounts, contacts, contact_accounts, conversations, messages
  │  │  ├─ Schema: SQLite with JSON for complex fields
  │  │  └─ NO encryption, NO provider configuration storage
  │  ├─ Provider Registry
  │  │  ├─ In-memory map: providerId → CommunicationProvider instance
  │  │  └─ Providers initialized from environment variables (.env)
  │  └─ Agent-facing tools (sendMessage, listConversations, etc)
  │
  └─ Providers (initialized at runtime)
     ├─ EmailProvider (IMAP/SMTP credentials from ENV)
     ├─ DiscordProvider (bot token from ENV)
     ├─ SlackProvider (webhook URL from ENV)
     └─ [future providers]
```

#### Problema Identificado
1. **Credentials em ENV:** Hardcoded em variáveis de ambiente, não auditadas, impossível rotacionar sem redeploy
2. **SQLClient Raw:** Queries manuais sem type-checking, vulnerável a erros de SQL injection
3. **Sem Multi-provider por Agent:** Cada agente tem 1 config de provider, não N
4. **Sem versionamento:** Impossível rastrear mudanças de credenciais ou fazer rollback
5. **Sem criptografia:** Credenciais armazenadas em plaintext em banco de dados (se estivessem persistidas)

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **ORM:** Nenhum (raw SQL via LibSQL Client)
- **Database:** LibSQL (SQLite-compatible)
- **Criptografia:** crypto (Node.js native) disponível mas não usado

### Dependências Existentes
- `@libsql/client` — Database client
- `zod` — Schema validation
- `crypto` — Node.js native encryption

---

## 3. Requisitos Funcionais

### 3.1 Armazenamento de Credenciais

**RF-1: Persistência de credenciais de provider**
- Armazenar configurações de provedor em banco de dados (não ENV)
- Suportar múltiplos provedores por agente
- Campos suportados:
  - Provider type (email, discord, slack, etc)
  - Provider-specific credentials (IMAP host, SMTP port, tokens, keys)
  - Agent assignment (qual agente usa este provider)
  - Status (active, inactive)
  - Created/updated timestamps

**RF-2: Criptografia de credenciais sensíveis**
- Criptografar valores sensíveis antes de persistir:
  - Passwords (IMAP, SMTP, SSH)
  - API tokens (Discord, Slack, etc)
  - OAuth refresh tokens
  - Private keys
- Deixar não-sensível em plaintext (hosts, ports, usernames)
- Usar AES-256-GCM com IV aleatório por record
- Armazenar chave de criptografia via ambiente (ENV)

**RF-3: Multi-provider por agente**
- Um agente pode ter N provedores configurados
- Exemplo: Agent A com email + Discord + Slack
- Exemplo: Agent B com email only
- Exemplo: Agent C com Slack + custom provider
- Sistema deve suportar add/remove sem afetar outros


### 3.2 Migração para Drizzle ORM

**RF-5: Migração de SQLClient para Drizzle**
- Converter queries raw do módulo de comunicação para Drizzle ORM
- Manter API compatível
- Type-safe queries via Drizzle schema

**RF-6: Schema revisado com Drizzle**
- Definir schema em `packages/mastra-engine/src/db/schema.ts`
- Adicionar tabelas para credenciais:
  - `provider_configurations` — Config do provider por agente
  - `provider_credentials` — Credenciais criptografadas
- Manter tabelas existentes: accounts, contacts, conversations, messages

### 3.3 Interface de Configuração

**RF-7: API de registro dinâmico de provider**
```typescript
// Na runtime, antes de criar Agent:
const providerConfig = {
  providerId: 'email-smtp-1',
  type: 'email',
  agentId: 'agent-123',
  config: {
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
  },
  secrets: {
    imapPassword: 'encrypted-value',
    smtpPassword: 'encrypted-value',
  },
  status: 'active',
};

await communication.registerProviderConfig(providerConfig);
```

**RF-8: API de lookup dinâmico de credenciais**
- Quando provider é inicializado, chamar:
```typescript
const credentials = await communication.getProviderCredentials(providerId);
// Retorna: { decrypted secrets } + plaintext config
```
- Se provider tiver múltiplas versões, usar `status=current`
- Cache em memória com TTL (60s) para evitar queries constantemente

**RF-9: Rotação de credenciais**
```typescript
await communication.rotateProviderCredentials(providerId, newSecrets);
// Steps:
// 1. Update credential com novo valor
// 2. Provider recarrega com nova credencial
```

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Lookup de credenciais < 100ms (suficiente para solo dev)
- **RNF-2:** Criptografia/decriptografia funcional

### 4.2 Segurança
- **RNF-3:** Chave de criptografia isolada por ambiente (ENV)
- **RNF-4:** Logging seguro: não logar valores de credenciais
- **RNF-5:** SQL injection prevention via Drizzle

### 4.3 Compatibilidade
- **RNF-6:** API de communication module não quebrada

---

## 5. Arquitetura da Solução

### 5.1 Novas Tabelas de Banco de Dados

```sql
-- Configuração de provider por agente
CREATE TABLE provider_configurations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,

  config_json TEXT NOT NULL,
  status TEXT NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (agent_id, provider_id),
  INDEX idx_agent_id (agent_id)
);

-- Credenciais criptografadas
CREATE TABLE provider_credentials (
  id TEXT PRIMARY KEY,
  configuration_id TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (configuration_id, secret_name),
  INDEX idx_configuration_id (configuration_id)
);
```

### 5.2 Estrutura Drizzle ORM

```typescript
// packages/mastra-engine/src/db/schema.ts

import { sqliteTable, text, timestamp, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export const providerConfigurations = sqliteTable('provider_configurations', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  agentId: text().notNull(),
  providerId: text().notNull(),
  providerType: text().notNull(),
  configJson: text().notNull(),
  status: text().$type<'active' | 'inactive' | 'revoked'>().notNull(),
  enabledAt: timestamp(),
  disabledAt: timestamp(),
  revokedAt: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  uniqueAgentProvider: uniqueIndex().on(table.agentId, table.providerId),
  idxAgentId: index().on(table.agentId),
  idxProviderType: index().on(table.providerType),
}));

export const providerCredentials = sqliteTable('provider_credentials', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  configurationId: text().notNull().references(() => providerConfigurations.id, { onDelete: 'cascade' }),
  secretName: text().notNull(),
  encryptedValue: text().notNull(),
  status: text().$type<'current' | 'pending' | 'superseded' | 'revoked'>().notNull(),
  version: integer().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  uniqueVersioning: uniqueIndex().on(table.configurationId, table.secretName, table.version),
  idxConfigurationId: index().on(table.configurationId),
  idxStatus: index().on(table.status),
}));

export const providerCredentialAudit = sqliteTable('provider_credential_audit', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  configurationId: text().notNull().references(() => providerConfigurations.id),
  credentialId: text().references(() => providerCredentials.id),
  action: text().$type<'created' | 'rotated' | 'revoked' | 'validated'>().notNull(),
  secretName: text(),
  statusFrom: text(),
  statusTo: text(),
  description: text(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxConfigurationId: index().on(table.configurationId),
  idxCreatedAt: index().on(table.createdAt),
}));

// Relations
export const providerConfigurationsRelations = relations(providerConfigurations, ({ many }) => ({
  credentials: many(providerCredentials),
  auditLog: many(providerCredentialAudit),
}));

export const providerCredentialsRelations = relations(providerCredentials, ({ one }) => ({
  configuration: one(providerConfigurations, {
    fields: [providerCredentials.configurationId],
    references: [providerConfigurations.id],
  }),
}));

// Remover tabela de auditoria para simplificar - solo dev não precisa
```

### 5.3 Módulo de Criptografia

```typescript
// packages/mastra-engine/src/agent/communication/encryption.ts

import crypto from 'node:crypto';

const ENCRYPTION_KEY = process.env.PROVIDER_CREDENTIALS_KEY;
// Must be: Buffer.alloc(32) → 256-bit key (base64 encoded in ENV)

type EncryptionResult = {
  encryptedValue: string; // Base64(IV + ciphertext + authTag)
  algorithm: string; // 'aes-256-gcm'
};

export function encryptSecret(plaintext: string): EncryptionResult {
  if (!ENCRYPTION_KEY) throw new Error('PROVIDER_CREDENTIALS_KEY not set');

  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('PROVIDER_CREDENTIALS_KEY must be 256-bit');

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Encode as: IV (16 bytes) + ciphertext + authTag (16 bytes)
  const combined = Buffer.concat([
    iv,
    Buffer.from(ciphertext, 'hex'),
    authTag,
  ]);

  return {
    encryptedValue: combined.toString('base64'),
    algorithm: 'aes-256-gcm',
  };
}

export function decryptSecret(encryptedValue: string): string {
  if (!ENCRYPTION_KEY) throw new Error('PROVIDER_CREDENTIALS_KEY not set');

  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('PROVIDER_CREDENTIALS_KEY must be 256-bit');

  const combined = Buffer.from(encryptedValue, 'base64');

  if (combined.length < 32) throw new Error('Invalid encrypted value');

  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(16, combined.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext.toString('hex'), 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

### 5.4 API de Provider Configuration

```typescript
// packages/mastra-engine/src/agent/communication/provider-config.ts

import { db } from '../db';
import { providerConfigurations, providerCredentials, providerCredentialAudit } from '../db/schema';
import { encryptSecret, decryptSecret } from './encryption';
import { eq, and, asc } from 'drizzle-orm';

export type ProviderConfig = {
  agentId: string;
  providerId: string;
  providerType: string;
  configJson: Record<string, unknown>; // { imap: { host, port, secure }, smtp: {...} }
  secrets: Record<string, string>; // { imapPassword, smtpPassword, etc }
};

export async function registerProviderConfig(
  db: Database,
  config: ProviderConfig
) {
  // Validate config structure
  if (!config.agentId || !config.providerId || !config.providerType) {
    throw new Error('Missing required fields: agentId, providerId, providerType');
  }

  // 1. Create provider configuration
  const configId = uuid();
  await db
    .insert(providerConfigurations)
    .values({
      id: configId,
      agentId: config.agentId,
      providerId: config.providerId,
      providerType: config.providerType,
      configJson: JSON.stringify(config.configJson),
      status: 'active',
    })
    .onConflictDoUpdate({
      target: [providerConfigurations.agentId, providerConfigurations.providerId],
      set: {
        configJson: JSON.stringify(config.configJson),
        updatedAt: new Date(),
      },
    });

  // 2. Encrypt and store secrets
  for (const [secretName, secretValue] of Object.entries(config.secrets)) {
    const encrypted = encryptSecret(secretValue);
    const credentialId = uuid();

    await db.insert(providerCredentials).values({
      id: credentialId,
      configurationId: configId,
      secretName,
      encryptedValue: encrypted.encryptedValue,
    });
  }

  return { configId, agentId: config.agentId, providerId: config.providerId };
}

export async function getProviderCredentials(
  db: Database,
  configurationId: string
): Promise<Record<string, string>> {
  const creds = await db
    .select({
      secretName: providerCredentials.secretName,
      encryptedValue: providerCredentials.encryptedValue,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.configurationId, configId),
        eq(providerCredentials.status, 'current')
      )
    );

  const decrypted: Record<string, string> = {};
  for (const cred of creds) {
    decrypted[cred.secretName] = decryptSecret(cred.encryptedValue);
  }

  return decrypted;
}

export async function rotateProviderCredentials(
  db: Database,
  configurationId: string,
  newSecrets: Record<string, string>
) {
  // Update secrets
  for (const [secretName, secretValue] of Object.entries(newSecrets)) {
    const encrypted = encryptSecret(secretValue);

    // Delete old and insert new
    await db
      .delete(providerCredentials)
      .where(
        and(
          eq(providerCredentials.configurationId, configurationId),
          eq(providerCredentials.secretName, secretName)
        )
      );

    const credentialId = uuid();
    await db.insert(providerCredentials).values({
      id: credentialId,
      configurationId,
      secretName,
      encryptedValue: encrypted.encryptedValue,
    });
  }

  return { status: 'rotated', configurationId };
}
```

---

## 6. Plano de Implementação

### Fase 1: Setup e Infraestrutura
- [ ] Definir schema simplificado (2 tabelas: configurations, credentials)
- [ ] Implementar módulo de criptografia (encrypt/decrypt functions)
- [ ] Criar migrations para adicionar novas tabelas

### Fase 2: API de Provider Configuration
- [ ] Implementar `registerProviderConfig()` function
- [ ] Implementar `getProviderCredentials()` com cache simples
- [ ] Implementar `rotateProviderCredentials()` function
- [ ] Testes unitários básicos

### Fase 3: Integração com Communication Module
- [ ] Converter queries raw para Drizzle ORM
- [ ] Integrar provider config lookup na inicialização de providers
- [ ] Testes de integração com providers reais

### Fase 4: Validação
- [ ] Testes end-to-end com múltiplos agentes
- [ ] Documentação de setup

---

## 7. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Chave de criptografia comprometida | Usar ENV, nunca em código |
| Migração Drizzle quebra queries | Testes antes/depois |
| Credenciais vazam em logs | Não logar valores sensíveis |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] Queries migradas para Drizzle ORM
- [ ] AES-256-GCM encryption/decryption funcional
- [ ] Sem plain-text secrets em banco de dados

### Funcionais
- [ ] Múltiplos provedores por agente funcionando
- [ ] Rotação de credenciais implementada
- [ ] Backwards compatibility com V1 (ENV-based providers)

---

## 9. Dependências Externas

### Internas
- Drizzle ORM (novo, precisa ser instalado)
- crypto (Node.js native, já disponível)
- zod (já existente)

### Externas
- Nenhuma (não usamos AWS Secrets Manager, Vault, etc nesta Phase 1)

### Compatibilidade
- LibSQL (SQLite) ✅ Suportado por Drizzle
- Node.js 18+ ✅ crypto built-in

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~80-100 horas (sprints de 4 semanas)

### Breakdown por Fase
1. **Phase 1 (Setup):** 20h (Drizzle setup, schema, crypto, tests)
2. **Phase 2 (API):** 25h (registerProviderConfig, rotate, audit)
3. **Phase 3 (Integration):** 30h (Converter queries, integrar com module)
4. **Phase 4 (Validation):** 15h (E2E tests, docs, performance)

### Story Points (Fibonacci)
- [ ] Epic PRD-02: 40 story points (4 sprints, 1 dev full-time)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/drizzle-orm-setup.md` — Como configurar Drizzle
2. `docs/implementation/provider-config-api.md` — API reference completa
3. `docs/implementation/encryption-key-setup.md` — Como gerar chave (base64)
4. `docs/implementation/migration-sql-to-drizzle.md` — Guia de conversão

### Para Operadores
1. `docs/operations/provider-configuration.md` — Como adicionar novos provedores
2. `docs/operations/credential-rotation.md` — Como rotacionar credenciais
3. `docs/operations/troubleshooting-providers.md` — Debugging de problemas

### Para Usuários/Agentes
- API de agent-facing tools não muda (backwards compatible)

---

## 12. Critérios de Aceitação

- [ ] Schema Drizzle definido e migrations criadas
- [ ] Criptografia implementada com testes (encrypt/decrypt roundtrip)
- [ ] API de provider config implementada e testada
- [ ] Todas as queries do communication module migradas para Drizzle
- [ ] Múltiplos provedores por agente funcionando em teste
- [ ] Rotação de credenciais sem downtime validada
- [ ] Auditoria completa (logs de todas as mudanças)
- [ ] Documentação completa
- [ ] Performance benchmark passou (< 50ms lookup)
- [ ] Zero plain-text secrets em banco de dados
- [ ] Backwards compatibility verificada

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Revisar com time:** Apresentar PRD para architectural review
2. **Decidir Drizzle version:** Qual versão usar? Verificar compatibility com LibSQL
3. **Gerar encryption key:** Setup de como teams geram chave base64 256-bit
4. **Ambiente de teste:** Criar branch/environment para desenvolvimento

### Após Phase 1
1. **OAuth2 integration:** Fase 2 pode incluir suporte a OAuth (rotation automática)
2. **KMS/HSM integration:** Considerar AWS Secrets Manager, HashiCorp Vault
3. **Multi-region replication:** Replicar credenciais entre regiões (se necessário)
4. **Sync entre instâncias:** Se múltiplas instâncias de runtime, sincronizar configs

### Longo Prazo
1. Integrar com sistema de auditoria centralizado
2. Dashboard de gerenciamento de providers (UI)
3. Webhooks para notificação de rotação/revogação
4. Backup/restore automatizado com criptografia

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após Phase 1 (discussão técnica)

---

## Apêndice A: Exemplo de Uso End-to-End

### Scenario: Adicionar novo agente com Email + Discord

```typescript
// 1. Gerar encryption key (operacional, uma vez)
const encryptionKey = crypto.randomBytes(32).toString('base64');
// Armazenar em ENV: PROVIDER_CREDENTIALS_KEY=<base64>

// 2. Registrar configuração de Email
await registerProviderConfig(db, {
  agentId: 'agent-123',
  providerId: 'email-primary',
  providerType: 'email',
  configJson: {
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
  },
  secrets: {
    imapPassword: 'app-password-from-gmail',
    smtpPassword: 'app-password-from-gmail',
  },
}, { validateConnection: true });

// 3. Registrar configuração de Discord
await registerProviderConfig(db, {
  agentId: 'agent-123',
  providerId: 'discord-main',
  providerType: 'discord',
  configJson: {
    serverId: 'SERVER_ID_HERE',
  },
  secrets: {
    botToken: 'discord-bot-token-here',
  },
}, { validateConnection: true });

// 4. Criar agente com providers dinâmicos
const agent = await createForgeAgent({
  agentId: 'agent-123',
  name: 'Agent 123',
  // Providers são lookup automático do DB (por agentId)
  // Não precisa passar provider config aqui!
});

// 5. Agent agora tem acesso a ambos os provedores
// tools: sendMessage({ provider: 'email-primary', ... })
// tools: sendMessage({ provider: 'discord-main', ... })

// 6. Rotacionar credenciais de email (sem downtime)
await rotateProviderCredentials(db, 'config-id-here', {
  imapPassword: 'new-app-password',
  smtpPassword: 'new-app-password',
});
// Validar → marcar como current → provider recarrega
```

---

**FIM DO DOCUMENTO**
