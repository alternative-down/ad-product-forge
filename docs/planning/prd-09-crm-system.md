# PRD-09: Sistema CRM

**Status:** ❌ Descartado - Não Validado
**Data:** 2026-03-15
**Versão:** 1.0
**Nota:** Projeto pessoal por desenvolvedor solo. Escopo limitado a funcionalidade principal (KISS + YAGNI).

**Razão do Descarte:** CRM centralizado não faz sentido. Os SaaS que os agentes criarem terão seu próprio admin/dashboard. Cada aplicação gerencia seus próprios clientes e relacionamentos. Descartado em 2026-03-15.

---

## Sumário Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de gerenciamento de relacionamento com cliente específica para ad-product-forge.** Capacidades de CRM permitem que agentes de vendas de Nicolas rastrearem autonomamente clientes, gerenciarem oportunidades e registrarem interações. Esta é específica da aplicação, não infraestrutura do framework.

### Objetivo
Implementar um sistema CRM simples para agentes rastrearem interações de cliente, gerenciarem pipeline de vendas e manterem dados de cliente sem dependências externas.

### Recursos Principais (para ad-product-forge)
1. **Gerenciamento de Cliente & Contato** - Armazenar info de cliente e contatos para produtos de Nicolas
2. **Pipeline de Vendas** - Rastrear oportunidades através de estágios de vendas
3. **Histórico de Interação** - Registrar emails, chamadas, reuniões com prospects e clientes
4. **Relatório Simples** - Métricas básicas em pipeline e atividade para supervisão de Nicolas

### Fora do Escopo
- Previsões de ML
- Dashboard de UI (Fase 2)
- Relatório avançado
- Integrações de terceiros
- Automação de email

---

## Modelo de Dados

### Clientes
```typescript
customers {
  id: UUID
  name: string
  email: string
  phone: string
  created_at: timestamp
  updated_at: timestamp
}
```

### Contatos
```typescript
contacts {
  id: UUID
  customer_id: UUID (foreign key)
  name: string
  email: string
  phone: string
  role: string (opcional)
  created_at: timestamp
  updated_at: timestamp
}
```

### Oportunidades
```typescript
opportunities {
  id: UUID
  customer_id: UUID (foreign key)
  title: string
  stage: string (prospecting | qualification | proposal | closed-won | closed-lost)
  created_at: timestamp
  updated_at: timestamp
}
```

### Interações
```typescript
interactions {
  id: UUID
  customer_id: UUID (foreign key)
  type: 'email' | 'call' | 'meeting' | 'note'
  summary: string
  occurred_at: timestamp
  created_at: timestamp
}
```

---

## Endpoints da API

### Clientes
- `POST /api/crm/customers` — Criar cliente
- `GET /api/crm/customers` — Listar clientes
- `GET /api/crm/customers/:id` — Obter detalhes de cliente
- `PUT /api/crm/customers/:id` — Atualizar cliente
- `DELETE /api/crm/customers/:id` — Deletar cliente

### Oportunidades
- `POST /api/crm/opportunities` — Criar oportunidade
- `GET /api/crm/opportunities` — Listar oportunidades
- `PUT /api/crm/opportunities/:id` — Atualizar oportunidade (incluindo mudanças de estágio)
- `DELETE /api/crm/opportunities/:id` — Deletar oportunidade

### Interações
- `POST /api/crm/interactions` — Registrar interação
- `GET /api/crm/customers/:id/interactions` — Obter interações de cliente

### Pipeline
- `GET /api/crm/pipeline` — Obter resumo de pipeline (contagem e valor por estágio)

---

## Notas de Implementação

### Banco de Dados
- Usar setup existente de Drizzle ORM + LibSQL
- Criar tabelas: `customers`, `contacts`, `opportunities`, `interactions`
- Adicionar índices simples em foreign keys e campos frequentemente consultados

### Integração
- Ferramentas de agente para criar/atualizar clientes e oportunidades
- Auto-registrar interações do módulo de comunicação (Fase 2)
- API REST simples para UI futura

### Validação
- Usar Zod para validação de schema
- Campos obrigatórios: nome de cliente, título de oportunidade, estágio

### Testes
- Testes unitários para operações principais
- Testes de endpoint de API
- Testes básicos de validação

---

## Critérios de Sucesso
- Agentes podem CRUD clientes e oportunidades
- API de pipeline retorna contagens por estágio
- Todos os dados persistem no banco de dados
- Filtragem básica por estágio/cliente funciona

---

## Dependências
- Drizzle ORM (existente)
- LibSQL (existente)
- Zod (existente)
- Framework de contexto/ferramentas de agentes (existente)

---
