# Modelo de Dados

## Visão Geral

O Forge usa Drizzle ORM com SQLite (libsql/Turso) como banco de dados central. Todas as tabelas são definidas em `apps/forge/src/database/schema.ts`.

## Tabelas Principais

### agents

Agentes persistidos no sistema.

| Coluna        | Tipo      | Descrição                             |
| ------------- | --------- | ------------------------------------- |
| id            | text (PK) | UUID do agente                        |
| name          | text      | Nome do agente                        |
| roleId        | text (FK) | Role do agente                        |
| status        | text      | Status (active, inactive, terminated) |
| workspacePath | text      | Caminho do workspace                  |
| createdAt     | integer   | Timestamp de criação                  |
| lastInitAt    | integer   | Último init                           |

### agent_roles

Roles que definem capabilities e permissões.

| Coluna                   | Tipo      | Descrição                        |
| ------------------------ | --------- | -------------------------------- |
| id                       | text (PK) | UUID do role                     |
| name                     | text      | Nome do role                     |
| description              | text      | Descrição                        |
| agentToolPermissions     | text      | JSON com permissões de tools     |
| agentWorkflowPermissions | text      | JSON com permissões de workflows |

### agent_providers

Credenciais de providers de comunicação.

| Coluna               | Tipo      | Descrição                     |
| -------------------- | --------- | ----------------------------- |
| id                   | text (PK) | UUID                          |
| agentId              | text (FK) | Agente dono                   |
| providerType         | text      | discord, internal-chat, email |
| encryptedCredentials | text      | Credenciais criptografadas    |

### agent_execution_contracts

Contratos financeiros dos agentes.

| Coluna    | Tipo      | Descrição               |
| --------- | --------- | ----------------------- |
| id        | text (PK) | UUID                    |
| agentId   | text (FK) | Agente dono             |
| startsAt  | integer   | Data de início          |
| endsAt    | integer   | Data de fim             |
| budgetUsd | real      | Budget em USD           |
| status    | text      | active, paused, expired |

### agent_execution_steps

Logs de execução de cada step do agente.

| Coluna       | Tipo      | Descrição         |
| ------------ | --------- | ----------------- |
| id           | text (PK) | UUID              |
| contractId   | text (FK) | Contrato          |
| agentId      | text (FK) | Agente            |
| llmProfileId | text      | Perfil LLM usado  |
| stepType     | text      | tipo do step      |
| inputTokens  | integer   | Tokens de entrada |
| outputTokens | integer   | Tokens de saída   |
| durationMs   | integer   | Duração em ms     |
| createdAt    | integer   | Timestamp         |

### agent_home_metric_snapshots

Snapshots de métricas do agente.

| Coluna            | Tipo      | Descrição             |
| ----------------- | --------- | --------------------- |
| id                | text (PK) | UUID                  |
| agentId           | text (FK) | Agente                |
| stepId            | text (FK) | Step                  |
| conversationCount | integer   | Contagem de conversas |
| messageCount      | integer   | Contagem de mensagens |

### agent_checkpointed_om_states

Estados de memória operacional checkpointados.

| Coluna                           | Tipo      | Descrição                   |
| -------------------------------- | --------- | --------------------------- |
| id                               | text (PK) | UUID                        |
| agentId                          | text (FK) | Agente                      |
| checkpointedOmTotalContextTokens | integer   | Total de tokens no contexto |
| checkpointedOmRecentRawTokens    | integer   | Tokens recentes             |
| stateJson                        | text      | Estado serializado          |

### schedules

Agendamentos de execução dos agentes.

| Coluna         | Tipo      | Descrição               |
| -------------- | --------- | ----------------------- |
| id             | text (PK) | UUID                    |
| agentId        | text (FK) | Agente                  |
| scheduleType   | text      | cron, interval, oneshot |
| cronExpression | text      | Expressão cron          |
| intervalMs     | integer   | Intervalo em ms         |
| nextStepAt     | integer   | Próximo step            |
| isActive       | integer   | Se está ativo           |

### system_settings

Configurações globais do sistema.

| Coluna | Tipo      | Descrição             |
| ------ | --------- | --------------------- |
| id     | text (PK) | UUID                  |
| key    | text      | Chave da configuração |
| value  | text      | Valor                 |

## Relacionamentos

```
agents 1──N agent_roles (roleId)
agents 1──N agent_providers
agents 1──N agent_execution_contracts
agents 1──N agent_execution_steps
agents 1──N agent_home_metric_snapshots
agents 1──N agent_checkpointed_om_states
agents 1──N schedules
agent_execution_contracts 1──N agent_execution_steps
```
