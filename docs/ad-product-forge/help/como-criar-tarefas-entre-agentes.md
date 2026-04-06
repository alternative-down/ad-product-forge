# Como Criar Tarefas Entre Agentes

Aprenda a coordenar trabalho entre múltiplos agentes no Ad Product Forge.

## Visão Geral

O sistema de tarefas entre agentes permite que um agente crie, gerencie e monitore tarefas para outros agentes. Isso é útil para:

- **Coordenação de trabalho**: Dividir tarefas complexas entre especialistas
- **Fluxos de trabalho automáticos**: Agente A inicia processo, agente B continua
- **Monitoramento centralizado**: Acompanhar o progresso de múltiplas tarefas
- **Escalabilidade**: Múltiplos agentes trabalhando em paralelo

---

## Papéis no Sistema de Tarefas

| Papel | Descrição | Permissões |
|-------|-----------|------------|
| **COORDINATOR** | Coordenador de tarefas | Criar, listar, cancelar e atualizar tarefas de qualquer agente |
| **AGENT** | Agente executor | Listar e atualizar apenas próprias tarefas |

### Quem Pode Fazer O Quê

| Ação | COORDINATOR | AGENT |
|------|:-----------:|:-----:|
| Criar tarefa para outro | ✅ | ❌ |
| Listar tarefas de qualquer agente | ✅ | ❌ |
| Listar próprias tarefas | ✅ | ✅ |
| Cancelar tarefa de outro | ✅ | ❌ |
| Atualizar tarefa de outro | ✅ | ❌ |
| Atualizar própria tarefa | ✅ | ✅ |

---

## Tipos de Agendamento

O sistema suporta diferentes tipos de agendamento para tarefas:

### 1. Execução Única (Once)

Para tarefas que devem ser executadas uma única vez em uma data/hora específica.

```javascript
{
  scheduleType: "once",
  scheduledDate: "2026-03-28T14:00:00Z", // Data ISO 8601
  taskData: {
    description: "Revisar PR #257",
    assigneeId: "agent-123",
    priority: "high"
  }
}
```

### 2. Recorrente (Recurring)

Para tarefas que se repetem em intervalos regulares.

```javascript
{
  scheduleType: "recurring",
  intervalMs: 7 * 24 * 60 * 60 * 1000, // A cada 7 dias
  taskData: {
    description: "Gerar relatório semanal",
    assigneeId: "agent-reports"
  }
}
```

### 3. Baseado em Cron (Cron)

Para agendamentos complexos usando expressão cron.

```javascript
{
  scheduleType: "cron",
  cronExpression: "0 9 * * 1", // Toda segunda-feira às 9h
  timezone: "America/Sao_Paulo",
  taskData: {
    description: "Daily standup report",
    assigneeId: "agent-standup"
  }
}
```

---

## Como Criar uma Tarefa

### Passo a Passo

1. **Identifique o coordenador**: Apenas agentes com role COORDINATOR podem criar tarefas
2. **Defina o agente executor**: Especifique qual agente receberá a tarefa
3. **Descreva a tarefa**: Forneça instruções claras do que deve ser feito
4. **Agende**: Escolha quando a tarefa deve ser executada
5. **Configure prioridade**: Opcional, para organizar a fila

### Exemplo: Criar Cron de Revisão

```javascript
// Exemplo de chamada da ferramenta manage_crons
{
  tool: "manage_crons",
  parameters: {
    action: "create",
    targetAgentId: "agent-code-reviewer",
    name: "Revisão do PR #257",
    description: "Verificar nomenclatura, testes e performance",
    scheduleType: "date",
    scheduledDate: "2026-03-28T15:00:00Z",
    timezone: "UTC",
    content: "Revisar código do PR #257 e verificar testes"
  }
}
```

---

## Como Listar Crons

### Listar Crons Criados para Outros Agentes

```javascript
{
  tool: "list_crons",
  parameters: {
    // sem filtro lista todos os crons criados por este agente
  }
}
```

### Filtrar por Agente de Destino

```javascript
{
  tool: "list_crons",
  parameters: {
    targetAgentId: "agent-123"
  }
}
```

### Listar Próprios Crons

```javascript
{
  tool: "list_self_crons",
  parameters: {}
}
```

### Resposta Típica

```json
{
  "crons": [
    {
      "cronId": "cron-001",
      "targetAgentId": "agent-123",
      "name": "Revisão do PR #257",
      "scheduleType": "date",
      "scheduledDate": "2026-03-28T15:00:00Z",
      "isActive": true
    }
  ]
}
```

---

## Como Atualizar um Cron

### Pausar um Cron

```javascript
{
  tool: "manage_crons",
  parameters: {
    action: "update",
    cronId: "cron-001",
    isActive: false
  }
}
```

### Atualizar Conteúdo ou Agendamento

```javascript
{
  tool: "manage_crons",
  parameters: {
    action: "update",
    cronId: "cron-001",
    description: "Revisar PR #257 - URGENTE",
    scheduledDate: "2026-03-28T12:00:00Z"
  }
}
```

---

## Como Deletar um Cron

### Deleção Simples

```javascript
{
  tool: "manage_crons",
  parameters: {
    action: "delete",
    cronId: "cron-001"
  }
}
```

### Próprio Cron

Use `manage_self_crons` com a mesma estrutura quando o cron for do próprio agente.

### Regras de Cancelamento

- Apenas COORDINATOR pode cancelar tarefas de outros
- Agentes podem cancelar próprias tarefas
- Tarefas já executadas não podem ser canceladas
- O cancelamento é registrado no histórico

---

## Status das Tarefas

| Status | Descrição | Transições Permitidas |
|--------|-----------|---------------------|
| `pending` | Aguardando execução | → in_progress, → cancelled |
| `in_progress` | Em andamento | → completed, → cancelled |
| `completed` | Finalizada com sucesso | (estado final) |
| `failed` | Falhou na execução | → pending (reagendar) |
| `cancelled` | Cancelada | (estado final) |

---

## Casos de Uso Comuns

### Caso 1: Pipeline de Code Review

```
Agente Dev → Cria PR → Aciona tarefa para Agente Reviewer
                              ↓
                    Reviewer revisa código
                              ↓
                    Reviewer cria tarefa para Agente QA
                              ↓
                         QA executa testes
```

### Caso 2: Relatório Agendado

```
Coordenador → Cria tarefa recorrente (diária 9h)
                          ↓
              Agente Relatórios executa todo dia
                          ↓
                    Gera e envia relatório
```

### Caso 3: Fluxo de Aprovação

```
Agente A → Submete para aprovação
                 ↓
         Tarefa criada para Aprovador
                 ↓
        Aprovador analisa e atualiza status
                 ↓
         Agente A é notificado do resultado
```

---

## Boas Práticas

### Estruturação de Tarefas

- **Seja específico**: Descreva exatamente o que deve ser feito
- **Forneça contexto**: Adicione metadados relevantes
- **Defina prazos realistas**: Considere a complexidade da tarefa
- **Priorize claramente**: Use prioridades para organizar a fila

### Comunicação

- **Documente no sistema**: Use o campo de descrição para tudo
- **Mantenha atualizado**: Altere status conforme progresso
- **Registre problemas**: Anote falhas e soluções

### Monitoramento

- **Check diário**: Revise tarefas pendentes diariamente
- **Identifique gargalos**: Agentes sobrecarregados precisam de ajuda
- **Reagende proativamente**: Antecipe tarefas que podem atrasar

---

## FAQ

**P: Um agente pode criar tarefa para si mesmo?**
R: Sim, mas isso não é recomendado. O sistema de tarefas é para coordenação entre agentes.

**P: O que acontece se o agente executor for desligado?**
R: As tarefas pendentes desse agente ficam órfãs. O COORDINATOR deve cancelá-las ou reagendá-las.

**P: Posso encadear tarefas (tarefa A → tarefa B)?**
R: Não existe trigger automático, mas o agente executor da tarefa A pode criar a tarefa B ao finalizar.

**P: Como saber se uma tarefa falhou?**
R: O status será `failed`. Configure notificações para ser alertado sobre falhas.

**P: É possível pausar uma tarefa recorrente?**
R: Sim, atualize o status para `cancelled` ou desative o schedule temporariamente.

---

## Tópicos Relacionados

- [Tarefas Entre Agentes - Detalhes Técnicos](../guias/agent-to-agent-tasks.md)
- [Sistema de Permissões](../guias/permissions.md)
- [Ciclo de Vida do Agente](../guias/agent-lifecycle.md)
