# PRD-31: Sistema de Emissão de Bilhetes

**Status:** Rascunho - Simplificado para Desenvolvedor Solo
**Data:** 2026-03-15
**Versão:** 1.0
**Nota:** Projeto pessoal por desenvolvedor solo. Escopo limitado a funcionalidade core (KISS + YAGNI).

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de suporte ao cliente específica do ad-product-forge.** Sistema de emissão de bilhetes permite que agentes de suporte de Nicolas rastreiem e resolvam problemas de cliente. Isto é específico da aplicação, não infraestrutura de framework.

### Objetivo
Implementar um sistema básico de emissão de bilhetes para rastrear e resolver problemas de suporte, com roteamento simples e rastreamento de status.

### Características Core
1. **Criação de Bilhete** - Criar bilhetes de suporte
2. **Rastreamento de Status** - Rastrear progresso de bilhete (aberto, fechado)
3. **Listagem Simples** - Visualizar todos bilhetes

### Fora do Escopo
- Roteamento e atribuição
- Comentários/notas
- Níveis de prioridade
- Integração multi-provedor
- Automação/fluxos de trabalho
- Rastreamento de tempo
- Rastreamento de SLA
- Portal de cliente

---

## Modelo de Dados

### Bilhetes
```typescript
tickets {
  id: UUID
  title: string
  description: string
  status: 'open' | 'closed'
  created_by: string (creator_id)
  created_at: timestamp
  updated_at: timestamp
}
```

---

## Endpoints de API

### Bilhetes
- `POST /api/tickets` — Criar bilhete
- `GET /api/tickets` — Listar bilhetes
- `GET /api/tickets/:id` — Obter detalhes do bilhete
- `PUT /api/tickets/:id` — Atualizar bilhete (status)
- `DELETE /api/tickets/:id` — Deletar bilhete

### Filtragem
- `GET /api/tickets?status=open` — Filtrar por status
- `GET /api/tickets?created_by=creator_id` — Filtrar por criador

---

## Notas de Implementação

### Banco de Dados
- Usar ORM Drizzle + LibSQL existentes
- Criar tabelas: `tickets`
- Índice em status e created_at

### Design de API
- Endpoints REST simples
- Todas atualizações via PUT

### Validação
- Usar Zod para validação de schema
- Obrigatório: título, descrição
- Status válidos: open, closed

### Testes
- Testes CRUD para bilhetes
- Testes de endpoint de API
- Testes de filtro de status

---

## Critérios de Sucesso
- Bilhetes conseguem ser criados, listados, atualizados e fechados
- Filtragem por status funciona
- Todos dados persistem corretamente

---

## Dependências
- Drizzle ORM (existente)
- LibSQL (existente)
- Zod (existente)

---

## Timeline
- **Semana 1:** Schema de banco de dados + todos endpoints
- **Semana 2:** Testes + documentação

Total: ~15 horas para desenvolvedor solo

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Simplificado para projeto pessoal de desenvolvedor solo
