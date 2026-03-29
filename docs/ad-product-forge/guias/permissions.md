# Sistema de Permissões e Capacidades

> **Baseado em:** `apps/forge/src/capabilities/catalog.ts`  
> **Última atualização:** 27/03/2026  
> **Autora:** Wiki Witch Writa

## Visão Geral

O Forge utiliza um sistema granular de permissões baseado em **roles** (papéis) e **capabilities** (capacidades). Cada agente recebe um ou mais roles que definem quais tools e workflows ele pode executar.

## Estrutura de Permissões

```
┌─────────────────────────────────────────────────────────────────┐
│                    HIERARQUIA DE PERMISSÕES                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Role ──────────► Capability                                   │
│  ┌─────────┐     ┌─────────────────────────────────────────┐   │
│  │ FINANCE │ ──► │ tool: list_company_cash                 │   │
│  │         │ ──► │ tool: get_company_cash                   │   │
│  │         │ ──► │ tool: adjust_agent_contract_budget      │   │
│  └─────────┘     └─────────────────────────────────────────┘   │
│                                                                 │
│  Role ──────────► Capability                                   │
│  ┌─────────┐     ┌─────────────────────────────────────────┐   │
│  │ DEVELOPER│───► │ tool: get_github_git_credentials       │   │
│  │         │ ──► │ tool: list_github_repositories          │   │
│  │         │ ──► │ tool: manage_github_repository           │   │
│  │         │ ──► │ ... (GitHub tools)                       │   │
│  └─────────┘     └─────────────────────────────────────────┘   │
│                                                                 │
│  Role ─────────► Workflow                                      │
│  ┌─────────┐     ┌─────────────────────────────────────────┐   │
│  │ ADMIN   │ ──► │ workflow: hire-internal-agent          │   │
│  │         │ ──► │ workflow: terminate-internal-agent      │   │
│  └─────────┘     └─────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Tools Disponíveis

### Ferramentas de Comunicação

| Tool ID | Descrição | Roles Comuns |
|---------|-----------|--------------|
| `search_web` | Busca na web | ALL |
| `list_contacts` | Lista contatos | ALL |
| `get_contact` | Busca contato | ALL |
| `upsert_contact` | Cria/atualiza contato | ALL |
| `list_conversations` | Lista conversas | ALL |
| `get_messages` | Busca mensagens | ALL |
| `send_message` | Envia mensagem | ALL |
| `create_chat_group` | Cria grupo | ADMIN |
| `add_member_to_group` | Adiciona membro | ADMIN |
| `remove_member_from_group` | Remove membro | ADMIN |
| `list_chat_groups` | Lista grupos | ALL |
| `list_group_members` | Lista membros | ALL |

### Ferramentas Financeiras

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `list_company_cash` | Lista saldo | FINANCE |
| `get_company_cash` | Busca saldo | FINANCE |
| `list_internal_agent_contracts` | Lista contratos | FINANCE |
| `manage_internal_agent_contract` | Gerencia contrato | FINANCE |
| `adjust_agent_contract_budget` | Ajusta orçamento | FINANCE |

### Ferramentas GitHub

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `get_github_git_credentials` | Credenciais Git | DEVELOPER |
| `list_github_repositories` | Lista repos | DEVELOPER |
| `get_github_repository` | Busca repo | DEVELOPER |
| `manage_github_repository` | Gerencia repo | DEVELOPER |
| `list_github_pull_requests` | Lista PRs | DEVELOPER |
| `get_github_pull_request` | Busca PR | DEVELOPER |
| `manage_github_pull_request` | Gerencia PR | DEVELOPER |
| `list_github_issues` | Lista issues | DEVELOPER |
| `get_github_issue` | Busca issue | DEVELOPER |
| `manage_github_issue` | Gerencia issue | DEVELOPER |
| `toggle_github_issue` | Abre/fecha issue | DEVELOPER |
| `list_github_issue_comments` | Lista comentários | DEVELOPER |
| `get_github_issue_comment` | Busca comentário | DEVELOPER |
| `create_github_issue_comment` | Cria comentário | DEVELOPER |
| `update_github_issue_comment` | Atualiza comentário | DEVELOPER |
| `delete_github_issue_comment` | Deleta comentário | DEVELOPER |
| `list_github_labels` | Lista labels | DEVELOPER |
| `manage_github_label` | Gerencia label | DEVELOPER |
| `list_github_milestones` | Lista milestones | DEVELOPER |
| `manage_github_milestone` | Gerencia milestone | DEVELOPER |

### Ferramentas Coolify

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `list_coolify_github_apps` | Lista GitHub Apps | DEVELOPER |
| `list_coolify_github_app_repositories` | Lista repos de App | DEVELOPER |
| `list_coolify_github_app_repository_branches` | Lista branches | DEVELOPER |
| `list_coolify_applications` | Lista aplicações | DEVELOPER |
| `get_coolify_application` | Busca aplicação | DEVELOPER |
| `manage_coolify_application` | Gerencia aplicação | DEVELOPER |
| `toggle_coolify_application` | Start/stop app | DEVELOPER |
| `list_coolify_application_deployments` | Lista deployments | DEVELOPER |
| `get_coolify_deployment_logs` | Logs de deployment | DEVELOPER |
| `get_coolify_application_logs` | Logs da aplicação | DEVELOPER |
| `get_coolify_application_envs` | Lista env vars | DEVELOPER |
| `manage_coolify_application_env` | Gerencia env vars | DEVELOPER |

### Ferramentas de Agendamento

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `list_agent_schedules` | Lista agendamentos | DEVELOPER |
| `manage_agent_schedule` | Gerencia agendamento | DEVELOPER |
| `toggle_agent_schedule` | Ativa/desativa | DEVELOPER |

### Ferramentas de Agentes

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `list_agent_functions` | Lista funções | ADMIN |
| `manage_agent_function` | Gerencia função | ADMIN |
| `list_agent_roles` | Lista roles | ADMIN |
| `manage_agent_role` | Gerencia role | ADMIN |
| `assign_role_to_function` | Atribui role | ADMIN |
| `change_agent_function` | Altera função | ADMIN |
| `change_own_function` | Altera própria função | ALL |
| `list_role_tool_permissions` | Lista permissões de tools | ADMIN |
| `manage_role_tool_permissions` | Gerencia permissões | ADMIN |
| `list_role_workflow_permissions` | Lista permissões de workflows | ADMIN |
| `manage_role_workflow_permissions` | Gerencia workflows | ADMIN |
| `list_available_capabilities` | Lista capacidades disponíveis | ALL |
| `list_agent_notifications` | Lista notificações | ALL |
| `mark_agent_notification_read` | Marca como lida | ALL |

## Workflows Disponíveis

| Workflow ID | Descrição | Roles |
|-------------|-----------|-------|
| `hire-internal-agent` | Contrata agente interno | ADMIN |
| `terminate-internal-agent` | Encerra agente | ADMIN |

## Aliases de Permissões Legadas

Para retrocompatibilidade, algumas tools possuem aliases:

```typescript
const legacyToolPermissionAliases = {
  // Cash
  list_company_cash: ['list_company_cash_movements', 'get_company_cash_summary'],
  get_company_cash: ['get_company_cash_balance'],
  
  // Contracts
  list_internal_agent_contracts: ['list_active_internal_agent_contracts', 'get_active_internal_agent_contract'],
  manage_internal_agent_contract: ['top_up_internal_agent_contract'],
  adjust_agent_contract_budget: ['adjust_internal_agent_contract_budget'],
  
  // Notifications
  list_agent_notifications: ['get_agent_notification'],
  
  // GitHub
  manage_github_repository: ['create_github_repository'],
  manage_github_pull_request: ['create_github_pull_request'],
  manage_github_issue: ['create_github_issue', 'update_github_issue'],
};
```

## Funções Auxiliares

### hasToolPermission()

Verifica se um agente pode usar uma tool:

```typescript
function hasToolPermission(
  agentRole: string,
  requestedToolId: string
): boolean
```

### normalizeToolPermissionIds()

Normaliza IDs de permissões, incluindo aliases:

```typescript
function normalizeToolPermissionIds(
  toolIds: string[]
): string[]
```

## Roles Comuns

| Role | Descrição | Capabilities Típicas |
|------|-----------|---------------------|
| `ADMIN` | Administrador | Todas + workflows de hire/terminate |
| `FINANCE` | Área financeira | Cash, contracts, budget |
| `DEVELOPER` | Desenvolvedor | GitHub, Coolify, schedules |
| `AGENT` | Agente genérico | Comunicação, notificações |

---

**Tags:** `permissions` `capabilities` `roles` `tools`
