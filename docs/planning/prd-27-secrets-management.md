# PRD-27: Sistema de Gerenciamento de Segredos

**Status:** Planejamento - Design Técnico
**Data:** 2026-03-15
**Escopo:** Projeto pessoal de desenvolvedor - Princípios KISS & YAGNI

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de gerenciamento de segredos específica do ad-product-forge.** Armazenamento de segredos permite que agentes de Nicolas acessem com segurança chaves de API e credenciais para integrações. Isto é específico da aplicação, não infraestrutura de framework (O PRD-02 de Mastra manipula credenciais de provedor de comunicação).

Implementar um sistema simples de gerenciamento de segredos para armazenar com segurança chaves de API, tokens e senhas usados por agentes.

**Objetivo Principal (para ad-product-forge):** Agentes conseguem recuperar com segurança credenciais (Stripe, GitHub, Coolify) sem expô-los em logs ou código.

---

## Declaração do Problema

Atualmente, segredos são:
- Armazenados como variáveis de ambiente (não escalável)
- Hardcoded em arquivos de config (risco de segurança)
- Não criptografados
- Não auditáveis

**Cenários Alvo:**
1. Agente recupera com segurança chave de API Stripe
2. Agente obtém credenciais de banco de dados sem expô-los
3. Admin consegue rotacionar segredos sem reiniciar

---

## Características Principais

### 1. Armazenamento Seguro
- Criptografar todos segredos usando AES-256-GCM
- Armazenar chave de criptografia em ambiente
- Prevenir segredos de aparecerem em logs

### 2. API de Agente
```typescript
// Obter um segredo
await agent.secrets.get('stripe_api_key'): Promise<string>;

// Listar segredos disponíveis (apenas metadados, sem valores)
await agent.secrets.list(): Promise<Array<{ name: string; }>>;
```

### 3. Operações de Admin
```typescript
// Criar/atualizar segredo
createSecret(input: {
  name: string;
  value: string;
}): Promise<{ secretId: string; }>;

// Deletar segredo
deleteSecret(secretId: string): Promise<void>;

// Listar segredos
listSecrets(): Promise<Array<{ secretId: string; name: string; }>>;
```

---

## Schema do Banco de Dados

**secrets**
```
- secretId (TEXT, PRIMARY KEY)
- name (TEXT, NOT NULL, UNIQUE)
- encryptedValue (TEXT, NOT NULL)
- iv (TEXT)    -- vetor de inicialização para criptografia
- createdAt (TEXT)
```

---

## Segurança

- Todos valores criptografados com AES-256-GCM
- Chave de criptografia da variável de ambiente `SECRETS_ENCRYPTION_KEY`
- Segredos nunca registrados ou expostos em mensagens de erro
- Acesso a todas operações registrado em trilha de auditoria

---

## Critérios de Sucesso

- [ ] Segredos são criptografados em repouso
- [ ] Agentes conseguem recuperar segredos via API
- [ ] Segredos nunca aparecem em logs

