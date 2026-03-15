# PRD-01: Sistema de Agentes Orientado a Banco de Dados

**Status:** Planejamento - Análise Técnica & Design
**Data:** 2026-03-15
**Versão:** 1.0
**ID da Feature:** CORE-001

> **Nota:** Este é um projeto pessoal de um desenvolvedor solo. Os requisitos focam em funcionalidade e simplicidade, não em robustez de nível empresarial.

---

## Sumário Executivo

**Componente do Framework:** Mastra Core - Registro e Persistência de Agentes

**Objetivo:** Transformar o framework de orquestração de agentes Mastra de configuração estática e hardcoded para um sistema dinâmico de criação e gerenciamento de agentes orientado a banco de dados que permite spawning de agentes em tempo de execução e gerenciamento de credenciais.

**Problema:** Atualmente, agentes são criados na inicialização com configuração fixa carregada de variáveis de ambiente. Isso impede criação dinâmica de agentes e torna o gerenciamento de credenciais inflexível. Qualquer deployment Mastra precisa dessa capacidade fundamental.

**Solução:** Implementar SQLite com Drizzle ORM como camada de persistência reutilizável para:
- Configurações e metadados de agentes (agnóstico de organização)
- Credenciais e configurações de provedores de comunicação
- Mapeamentos agente-para-provedor
- Armazenamento criptografado de dados sensíveis
- Suporte para deployments de instância única e distribuídos

**Proposição de Valor (Framework):**
- Permitir que qualquer deployment Mastra suporte criação de agentes em tempo de execução sem reinicialização
- Armazenamento seguro de credenciais com criptografia transparente
- Fundação para multi-tenancy e orquestração avançada
- Simples de implantar, escala de desenvolvedor solo a uso em equipe

**Proposição de Valor (Aplicação ad-product-forge):**
- Permitir que agentes de Nicolas criem autonomamente agentes especialistas para pesquisa, desenvolvimento e lançamento de produtos
- Suportar gerenciamento de credenciais para Discord, Email e outros provedores de comunicação
- Fundação para workflow de contratação e hierarquia de agentes

**Escopo:** Fase 1 do gerenciamento de ciclo de vida de agentes, focando em infraestrutura de persistência para o framework Mastra em si

---

## Declaração do Problema

### Estado Atual
A aplicação atualmente:
- Cria agentes na inicialização da aplicação a partir de funções factory hardcoded
- Carrega credenciais de provedor diretamente de variáveis de ambiente (`.env`)
- Não fornece mecanismo em tempo de execução para criação ou reconfiguração de agentes
- Armazena dados de comunicação (contatos, mensagens) em bancos de dados SQLite por agente
- Carece de um registro centralizado de agentes ou repositório de configuração

### Pontos de Dor
1. **Sem Criação Dinâmica de Agentes:** Não pode criar agentes em tempo de execução sem mudanças de código
2. **Credenciais em Texto Plano:** Credenciais armazenadas em vars de ambiente sem criptografia
3. **Sem Flexibilidade em Tempo de Execução:** Não pode mudar ligações de provedor sem reinicialização
4. **Configuração Espalhada:** Config espalhada entre ambiente e código

### Suposições Principais
- SQLite com Drizzle ORM é suficiente para este sistema de instância única
- Criptografia será tratada via módulo `crypto` (built-in do Node.js) com estratégia de chave master
- Provedores de comunicação (Discord, Email) continuarão funcionando com credenciais armazenadas

---

## Objetivos

### Objetivos Primários
1. **Estabelecer Registro Centralizado de Agentes:** Criar schema de banco de dados para persistir configurações de agentes, incluindo ID, nome, descrição, instruções e atribuições de modelo
2. **Persistir Credenciais de Provedor:** Armazenar credenciais de provedor de comunicação (tokens, senhas, strings de conexão) em forma criptografada
3. **Habilitar Criação de Agentes em Tempo de Execução:** Implementar APIs/ferramentas para criar agentes dinamicamente sem reinicialização da aplicação
4. **Assegurar Dados Sensíveis:** Criptografar campos sensíveis (credenciais, tokens) antes do armazenamento e descriptografar na recuperação

### Critérios de Sucesso
- Toda configuração de agente pode ser lida e escrita no banco de dados
- Dados sensíveis são criptografados em repouso
- Agentes podem ser criados e iniciados dinamicamente via API/ferramentas
- Sistema funciona corretamente com nova abordagem orientada a banco de dados

---

## Requisitos

### Requisitos Funcionais

#### FR1: Armazenamento de Configuração de Agentes
- Armazenar metadados de agentes: ID, nome, descrição, modelo, instruções
- Rastrear timestamps de criação/modificação de agentes

#### FR2: Associações Agente-Provedor
- Associar cada agente a múltiplos provedores (Discord, Email, etc)
- Armazenar credenciais criptografadas por par agente-provedor
- Suportar provider_type: discord, email, slack, etc

#### FR3: Criptografia & Segurança
- Criptografar JSON de credenciais antes do armazenamento
- Descriptografar credenciais na recuperação de forma transparente
- Usar criptografia AES-256-GCM
- Nenhuma credencial registrada em texto plano

#### FR4: Inicialização de Agentes em Tempo de Execução
- Carregar agentes e suas credenciais do banco de dados na inicialização
- Descriptografar credenciais para cada provedor
- Criar instâncias de agentes a partir da configuração do banco de dados

---

## Arquitetura

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de persistência específica para a aplicação ad-product-forge de Nicolas.** É específica da aplicação, não um componente reutilizável do framework Mastra. Define como ad-product-forge armazena e criptografa configurações de agentes e credenciais.

### Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│          ad-product-forge: Application Startup               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐ │
│  │ Environment Vars │     │ Agent Registry DB (SQLite)   │ │
│  │ (ENCRYPTION_KEY) │     │                              │ │
│  └──────────────────┘     │  agents                      │ │
│         │                 │  agent_providers             │ │
│         │                 │  (encrypted_credentials)     │ │
│         ▼                 └──────────────────────────────┘ │
│  ┌──────────────────┐                                      │
│  │ Encryption Layer │◀──────── Drizzle ORM               │
│  │ (encrypt/decrypt)│     (Query + Schema)               │
│  └──────────────────┘                                      │
│         ▲                                                   │
│         │                                                   │
│  ┌──────────────────┐                                      │
│  │ Agent Loader     │                                      │
│  └──────────────────┘                                      │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────┐                                      │
│  │ Agent Registry   │                                      │
│  │ (In-Memory)      │                                      │
│  └──────────────────┘                                      │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────┐                                      │
│  │ Mastra Instance  │                                      │
│  │ (Agent Executor) │                                      │
│  └──────────────────┘                                      │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

### Responsabilidades dos Componentes

#### 1. **Módulo de Banco de Dados de Registro de Agentes** (`packages/mastra-engine/src/database/`)
- Inicializar Drizzle ORM com SQLite
- Definir schema usando definições Drizzle
- Fornecer construtores de query com tipo
- Suportar armazenamento de metadados de agentes e associações agente-provedor

#### 2. **Camada de Criptografia** (`packages/mastra-engine/src/encryption/`)
- Carregar chave de criptografia do ambiente
- Fornecer utilitários de criptografia/descriptografia
- Suportar criptografia AES-256-GCM
- Criptografar/descriptografar JSON de credenciais na tabela `agent_providers`

#### 3. **Agent Loader** (`packages/mastra-engine/src/agent/loader.ts`)
- Consultar banco de dados para agentes e agent_providers na inicialização
- Inicializar camada de criptografia
- Descriptografar credenciais para cada provedor
- Criar instâncias de agentes usando configuração do banco de dados

### Fluxo de Dados

#### Fluxo de Criação de Agentes (Tempo de Execução)
```
Requisição de Usuário/Ferramenta
    │
    ▼
Entrada de Criação de Agente (validada via Zod)
    │
    ▼
Serviço de Agent Loader
    │
    ├─→ Validar entrada (nome do agente, modelo, provedores)
    │
    ├─→ Gerar ID único do agente
    │
    ├─→ Persistir no banco de dados
    │
    └─→ Retornar instância do agente
```

#### Fluxo de Carregamento de Agentes (Inicialização)
```
Inicialização da Aplicação
    │
    ▼
Inicializar Conexão com Banco de Dados
    │
    ├─→ Carregar chave de criptografia do env
    │
    ├─→ Consultar tabela de agentes
    │
    ├─→ Carregar e descriptografar credenciais de provedor
    │
    ├─→ Inicializar provedores com credenciais
    │
    └─→ Criar instâncias de agentes no registro
```

#### Lookup de Credenciais de Provedor
```
Agente precisa se conectar a um provedor
    │
    ▼
Consultar tabela agent_providers (agent_id + provider_type)
    │
    ├─→ Obter encrypted_credentials (JSON)
    │
    ├─→ Descriptografar com ENCRYPTION_KEY
    │
    └─→ Extrair token/senha e retornar ao agente
```

---

## Schema do Banco de Dados

### Visão Geral do Schema

```sql
-- Configuração principal de agentes
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT NOT NULL,
  instructions TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Associações agente-para-provedor com credenciais criptografadas
CREATE TABLE agent_providers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,      -- ex: 'discord', 'email'
  encrypted_credentials TEXT NOT NULL,  -- JSON criptografado: {token, password, etc}
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(agent_id, provider_type)
);
```

### Estratégia de Criptografia

**Criptografia de Campo:**
- Apenas `encrypted_credentials` na tabela `agent_providers` é criptografado
- Todos os outros campos são texto plano (agent_id, provider_type, created_at)
- Credenciais são armazenadas como JSON criptografado: `{token: "...", password: "...", etc}`
- Criptografia usa AES-256-GCM

**Gerenciamento de Chaves:**
- Chave master carregada da variável de ambiente `ENCRYPTION_KEY`
- Chave deve ter 32 bytes (256 bits) para AES-256-GCM
- Simples para desenvolvedor solo (sem rotação necessária inicialmente)

**Descriptografia em Tempo de Execução:**
```typescript
const agentProviders = await db.query.agent_providers.findMany({
  where: eq(agent_providers.agent_id, agentId)
});

for (const ap of agentProviders) {
  const decryptedCreds = decrypt(ap.encrypted_credentials);
  provider.initialize(ap.provider_type, decryptedCreds);
}
```

**Implementação de Criptografia (Node.js crypto):**
```typescript
import crypto from 'node:crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY deve ser 256-bit');

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, Buffer.from(ciphertext, 'hex'), authTag]);

  return combined.toString('base64');
}

export function decryptSecret(encryptedValue: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY deve ser 256-bit');

  const combined = Buffer.from(encryptedValue, 'base64');
  if (combined.length < 32) throw new Error('Valor criptografado inválido');

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

---

## API de Gerenciamento de Provedor

### Registrar Credenciais de Provedor
```typescript
async function registerProviderConfig(agentId: string, providerType: string, credentials: Record<string, string>) {
  // 1. Criptografar credenciais
  const encrypted = encryptSecret(JSON.stringify(credentials));

  // 2. Armazenar em agent_providers
  await db.insert(agent_providers).values({
    agent_id: agentId,
    provider_type: providerType,
    encrypted_credentials: encrypted,
    created_at: Date.now()
  });
}
```

### Obter Credenciais de Provedor
```typescript
async function getProviderCredentials(agentId: string, providerType: string): Promise<Record<string, string>> {
  const record = await db.query.agent_providers.findFirst({
    where: and(
      eq(agent_providers.agent_id, agentId),
      eq(agent_providers.provider_type, providerType)
    )
  });

  if (!record) return {};

  const decrypted = decryptSecret(record.encrypted_credentials);
  return JSON.parse(decrypted);
}
```

### Rotacionar Credenciais de Provedor
```typescript
async function rotateProviderCredentials(agentId: string, providerType: string, newCredentials: Record<string, string>) {
  const encrypted = encryptSecret(JSON.stringify(newCredentials));

  await db.update(agent_providers)
    .set({ encrypted_credentials: encrypted })
    .where(and(
      eq(agent_providers.agent_id, agentId),
      eq(agent_providers.provider_type, providerType)
    ));
}
```

---

## Decisões Técnicas

### 1. SQLite + Drizzle ORM
**Decisão:** Usar SQLite com Drizzle ORM como combo banco de dados/ORM

**Justificativa:**
- SQLite é sem servidor, baseado em arquivo, requer setup mínimo
- Drizzle fornece construção de query com tipo seguro e gerenciamento de schema
- Sistema de instância única não precisa de complexidade de banco de dados relacional
- Fácil de inspecionar e debugar

**Alternativas Consideradas:**
- PostgreSQL: Excessivo para projeto pessoal de instância única
- SQL bruto: Perder type safety, mais propenso a erros

### 2. Criptografia AES-256-GCM
**Decisão:** Usar módulo `crypto` built-in do Node.js com AES-256-GCM para criptografia em nível de campo

**Justificativa:**
- Nenhuma dependência externa necessária
- Algoritmo de criptografia padrão da indústria
- Modo GCM fornece criptografia autenticada (detecta falsificação)
- Performance suficiente para sistema de instância única

**Alternativas Consideradas:**
- Biblioteca de criptografia externa: Adiciona dependência, mais complexa
- Criptografia em nível de banco de dados: Menos flexível, mais difícil de migrar

### 3. Chave Master via Variável de Ambiente
**Decisão:** Armazenar chave master de criptografia em variável de ambiente `ENCRYPTION_KEY`

**Justificativa:**
- Simples para desenvolvedor solo
- Funciona com carregamento de arquivo `.env`

### 4. Fallback para Configuração Hardcoded
**Decisão:** Manter configuração de agentes hardcoded como fallback

**Justificativa:**
- Sistema funciona mesmo se banco de dados estiver indisponível
- Permite migração gradual

