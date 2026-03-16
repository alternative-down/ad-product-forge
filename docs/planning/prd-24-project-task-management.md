# PRD-24: Gerenciamento de Projeto & Tarefa

**Status:** Rascunho - Simplificado para Desenvolvedor Solo
**Data:** 2026-03-15
**Versão:** 1.0
**Nota:** Projeto pessoal por desenvolvedor solo. Escopo limitado a funcionalidade core (KISS + YAGNI).

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de gerenciamento de projeto específica do ad-product-forge.** Rastreamento de tarefa permite que Nicolas organize e monitore trabalho de agente através de múltiplos projetos. Isto é específico da aplicação, não infraestrutura de framework.

### Objetivo
Implementar um sistema simples de gerenciamento de tarefa para organizar trabalho em projetos com rastreamento de status, sem dependências complexas, hierarquias ou recursos de colaboração.

### Características Core
1. **Projetos** - Criar e organizar trabalho em projetos
2. **Tarefas** - Criar tarefas dentro de projetos com status básico
3. **Rastreamento de Status** - Rastrear progresso de tarefa (to-do, in-progress, done)
4. **Listagem Simples** - Visualizar tarefas filtradas por projeto ou status

### Fora do Escopo
- Dependências de tarefa
- Subtarefas/hierarquias
- Atribuições/recursos de equipe
- Comentários/discussões
- Anexos de arquivo
- Notificações
- Feeds de atividade
- Filtragem avançada
- Dashboards

---

## Modelo de Dados

### Projetos
```typescript
projects {
  id: UUID
  name: string
  description: string (opcional)
  status: 'active' | 'archived'
  created_at: timestamp
  updated_at: timestamp
}
```

### Tarefas
```typescript
tasks {
  id: UUID
  project_id: UUID (chave estrangeira)
  title: string
  description: string (opcional)
  status: 'to-do' | 'in-progress' | 'done'
  created_at: timestamp
  updated_at: timestamp
}
```

---

## Endpoints de API

### Projetos
- `POST /api/projects` — Criar projeto
- `GET /api/projects` — Listar projetos
- `GET /api/projects/:id` — Obter detalhes do projeto
- `PUT /api/projects/:id` — Atualizar projeto
- `DELETE /api/projects/:id` — Deletar projeto

### Tarefas
- `POST /api/projects/:project_id/tasks` — Criar tarefa
- `GET /api/projects/:project_id/tasks` — Listar tarefas do projeto
- `GET /api/tasks/:id` — Obter detalhes da tarefa
- `PUT /api/tasks/:id` — Atualizar tarefa (incluindo mudanças de status)
- `DELETE /api/tasks/:id` — Deletar tarefa

### Filtragem
- `GET /api/tasks?status=in-progress` — Listar tarefas por status
- `GET /api/tasks?project_id=X` — Listar tarefas por projeto (via GET /api/projects/:project_id/tasks)

---

## Notas de Implementação

### Banco de Dados
- Usar ORM Drizzle + LibSQL existentes
- Criar tabelas: `projects`, `tasks`
- Índice em project_id para queries rápidas de tarefa
- Índice em status para filtragem

### Design de API
- Endpoints REST simples
- Todas atualizações de campo via PUT
- Delete permanente é aceitável

### Validação
- Usar Zod para validação de schema
- Obrigatório: nome de projeto, título de tarefa
- Status válidos aplicados em nível de API

### Testes
- Testes unitários para operações CRUD
- Testes de endpoint de API
- Testes de transição de status

---

## Critérios de Sucesso
- Projetos conseguem ser criados, listados, atualizados, deletados
- Tarefas conseguem ser criadas e movidas entre statuses
- Filtragem por projeto e status funciona
- Dados persistem corretamente

---

## Dependências
- Drizzle ORM (existente)
- LibSQL (existente)
- Zod (existente)

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Simplificado para projeto pessoal de desenvolvedor solo
