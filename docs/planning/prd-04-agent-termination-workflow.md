# PRD-04: Workflow de Terminação de Agentes

**Status:** Planejamento
**Data:** 2026-03-15

> **Nota:** Este é um projeto pessoal de um desenvolvedor solo. Os requisitos focam em funcionalidade e simplicidade.

---

## Objetivo

Permitir que agentes terminem autonomamente outros agentes (ou admin terminar qualquer agente). Workflow de terminação usa padrão de workflow Mastra para remover limpar o agente do sistema e limpar recursos.

---

## Requisitos

### FR1: Terminar Agente via Workflow
- Agente solicita terminar agente via ferramenta (similar a contratação)
- Entrada: agentId, motivo (opcional)
- Usa padrão de workflow Mastra
- Saída: confirmação com recursos deletados

### FR2: Limpeza de Recursos
- Deletar agente da tabela `agents`
- Cascade delete da tabela `agent_providers` (via FK)
- Deletar arquivos de banco de dados do agente (se houver: `{agentId}.db`)
- Deletar arquivos de memória/estado do agente (`.forge-memory/{agentId}/`)
- Limpar qualquer arquivo temporário específico do agente

### FR3: Confirmação de Terminação
- Retornar confirmação com lista de recursos deletados
- Registrar evento de terminação (trilha de auditoria)

---

## Arquitetura

### Componentes

1. **Workflow de Terminação** — Workflow Mastra invocado por agente
2. **Deleção em Cascata** — Restrições de banco de dados fazem deletes de FK em cascata
3. **Limpeza de Arquivo** — Encontrar e deletar arquivos específicos do agente
4. **Logging** — Registrar evento de terminação

### Fluxo

```
Agente invoca workflow de terminação
  │
  ├─ Mastra workflow: terminateAgent({agentId, reason})
  │
  ├─ Workflow executa:
  │  ├─ Validar agentId existe
  │  ├─ Deletar da tabela agents
  │  ├─ Cascade: deletar de agent_providers
  │  ├─ Encontrar e deletar {agentId}.db
  │  ├─ Encontrar e deletar .forge-memory/{agentId}/
  │  ├─ Registrar evento de terminação
  │  └─ Retornar confirmação
  │
  └─ Retornar lista de recursos deletados para agente
```

---

## Schema do Banco de Dados

**Nenhuma tabela nova necessária.**

**Mudanças na tabela agents:**
- Opcional: adicionar `terminated_at` (TIMESTAMP) para rastrear quando agente foi deletado
- Ou: simplesmente deletar linha da tabela

**Deletes em cascata:**
- `agent_providers`: deletar todas as linhas onde `agent_id = {agentId}`
- Isso limpa todas as credenciais automaticamente

---

## Decisões Técnicas

### 1. Hard Delete vs Soft Delete
**Decisão:** Hard delete (remover da tabela completamente)

**Justificativa:**
- Projeto dev solo, nenhuma compliance/retenção de auditoria necessária
- Modelo de dados mais simples
- Sem necessidade de recuperação de agente deletado

### 2. Deleção em Cascata
**Decisão:** Deletar todos os registros relacionados (agent_providers, credenciais)

**Justificativa:**
- Remoção limpa
- Sem credenciais órfãs
- Restrições de banco de dados garantem consistência

### 3. Limpeza de Arquivo
**Decisão:** Deletar arquivos de banco de dados do agente e diretórios de memória

**Justificativa:**
- Liberar espaço em disco
- Estado de sistema limpo
- Sem arquivos órfãos
