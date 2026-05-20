# PRD-32: Templates de Aplicação Web

> Status: planned. This document does not describe implemented behavior unless explicitly stated.

**Status:** Planejamento - Design Técnico
**Data:** 2026-03-15
**Escopo:** Projeto pessoal de desenvolvedor - Princípios KISS & YAGNI

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Dependency note:** This PRD is downstream of the application/repository layer and should not define GitHub organization ownership or deployment state.

**Este PRD descreve infraestrutura de geração de código específica do ad-product-forge.** Templates de aplicação permitir que agentes de desenvolvimento de Nicolas façam scaffold de novos produtos em velocidade. Isto é tooling de desenvolvedor específica da aplicação, não infraestrutura de framework.

Fornecer templates de aplicação pré-construídos para que agentes façam scaffold rapidamente de aplicações production-ready com padrões padrão para autenticação, banco de dados e deployment.

**Objetivo Principal (para ad-product-forge):** Agentes conseguem gerar uma aplicação web completa em segundos em vez de construir do zero. Permite desenvolvimento de produto autônomo rápido.

---

## Declaração do Problema

Atualmente, agentes começando novas aplicações devem:

- Configurar autenticação manualmente
- Configurar conexões de banco de dados
- Criar código boilerplate
- Configurar tratamento de erro, logging, deployment

Isto é consumidor de tempo e repetitivo.

**Cenários Alvo:**

1. Agente executa: `scaffold create-app --template rest-api --name my-api`
2. Agente obtém REST API pronto-para-customizar com auth e banco de dados
3. Agente consegue fazer deploy imediatamente

---

## Características Principais

### 1. Gerenciamento de Template

```typescript
// Listar templates disponíveis
listTemplates(): Promise<Array<{
  templateId: string;
  name: string;
  description: string;
  framework: string;
  language: string;
}>>;

// Criar aplicação de template
createApplication(input: {
  templateId: string;
  appName: string;
  outputPath: string;
  parameters?: Record<string, any>;
}): Promise<{
  success: boolean;
  projectPath: string;
}>;
```

### 2. Interface de CLI

```bash
# Listar templates
agent-scaffold list

# Criar nova app
agent-scaffold create-app \
  --template rest-api \
  --name my-api \
  --output ./apps/my-api

# Customizar template
agent-scaffold configure --app-path ./apps/my-api
```

---

## Templates Core

### Template 1: Backend de REST API

- **Stack:** Node.js/Express, TypeScript, SQLite
- **Inclui:**
  - Rotas CRUD básicas
  - Setup de schema de banco de dados
  - Tratamento de erro
  - Template .env

### Template 2: Aplicação Web Full-Stack

- **Stack:** React, Node.js, SQLite, TypeScript
- **Inclui:**
  - Login/signup básico
  - Dashboard de usuário
  - API de backend
  - Design responsivo (Tailwind)

---

## Estrutura de Template

```
templates/
├── rest-api-backend/
│  ├── template.yml          # Metadados
│  ├── src/
│  │  ├── config/
│  │  ├── routes/
│  │  ├── services/
│  │  ├── db/
│  │  └── index.ts
│  ├── tests/
│  ├── package.json
│  ├── .env.example
│  ├── docker-compose.yml
│  ├── README.md
│  └── hooks/
│     └── setup.sh
```

---

## Critérios de Sucesso

- [ ] Agente consegue listar templates
- [ ] Agente consegue gerar aplicação em < 10 segundos
- [ ] Aplicação gerada é executável sem modificações
- [ ] Templates são bem documentados
- [ ] Instruções de setup são claras

---

**Fim do documento**
