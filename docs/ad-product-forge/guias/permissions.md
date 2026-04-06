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
│  │         │ ──► │ tool: create_github_repository          │   │
│  │         │ ──► │ tool: update_github_repository          │   │
│  │         │ ──► │ tool: delete_github_repository          │   │
│  │         │ ──► │ ... (mais GitHub tools)                 │   │
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
| `list_contacts` | Lista contatos | ALL |
| `upsert_contact` | Cria/atualiza contato | ALL |
| `list_conversations` | Lista conversas | ALL |
| `get_messages` | Busca mensagens | ALL |
| `send_message` | Envia mensagem | ALL |
| `change_chat_group` | Cria ou atualiza grupo | ADMIN |

### Ferramentas Financeiras

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `list_company_cash` | Lista saldo | FINANCE |
| `get_company_cash` | Busca saldo | FINANCE |
| `list_internal_agent_contracts` | Lista contratos | FINANCE |
| `adjust_agent_contract_budget` | Ajusta orçamento | FINANCE |

### Ferramentas GitHub

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `get_github_git_credentials` | Credenciais Git | DEVELOPER |

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
| `list_self_crons` | Lista crons próprios | DEVELOPER |
| `manage_self_crons` | Gerencia crons próprios | DEVELOPER |
| `list_crons` | Lista crons criados para outros agentes | DEVELOPER |
| `manage_crons` | Gerencia crons para outros agentes | DEVELOPER |

### Ferramentas MiniMax

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `minimax_tts` | Gera áudio via text-to-speech | DEVELOPER |
| `minimax_image` | Gera imagem via IA | DEVELOPER |
| `minimax_video` | Gera vídeo via IA | DEVELOPER |

### Ferramentas de Agentes

| Tool ID | Descrição | Roles |
|---------|-----------|-------|
| `list_agent_functions` | Lista funções | ADMIN |
| `manage_agent_function` | Gerencia função | ADMIN |
| `list_agent_roles` | Lista roles | ADMIN |
| `manage_agent_role` | Gerencia role | ADMIN |
| `assign_role_to_function` | Atribui role | ADMIN |
| `change_agent_function` | Altera função | ADMIN |
| `list_role_capabilities` | Lista capacidades da role | ADMIN |
| `manage_role_capabilities` | Gerencia capacidades | ADMIN |
| `list_agent_notifications` | Lista notificações | ALL |

## Workflows Disponíveis

| Workflow ID | Descrição | Roles |
|-------------|-----------|-------|
| `hire-internal-agent` | Contrata agente interno | ADMIN |
| `terminate-internal-agent` | Encerra agente | ADMIN |

## Aliases de Permissões Legadas

Para retrocompatibilidade, ferramentas legadas redirecionam para ferramentas de responsabilidade única:

```typescript
const legacyToolPermissionAliases = {
  // Cash
  list_company_cash: ['list_company_cash_movements', 'get_company_cash_summary'],
  get_company_cash: ['get_company_cash_balance'],
  
  // Contracts
  list_internal_agent_contracts: ['list_active_internal_agent_contracts', 'get_active_internal_agent_contract'],
  adjust_agent_contract_budget: ['adjust_internal_agent_contract_budget'],
  
  // Notifications
  list_agent_notifications: ['get_agent_notification'],
  
  // GitHub - Pull Requests (PR comments)
  list_github_pull_request_comments: ['list_github_pull_request_comments'],
  
  // GitHub - Issues
  toggle_github_issue: ['toggle_github_issue'],
  
  // GitHub - Coolify Integration
  manage_coolify_application: ['create_coolify_application', 'update_coolify_application', 'delete_coolify_application', 'restart_coolify_application'],
  toggle_coolify_application: ['start_coolify_application', 'stop_coolify_application'],
  get_coolify_application_envs: ['list_coolify_application_envs'],
  manage_coolify_application_env: ['set_coolify_application_env', 'delete_coolify_application_env'],
  
  // Scheduling
  create_cron_for_agent: ['create_schedule_for_agent'],
  edit_cron: ['edit_schedule'],
  delete_cron: ['delete_schedule'],
  
  // Agent Management
  manage_agent_function: ['create_agent_function', 'update_agent_function'],
  manage_agent_role: ['create_agent_role', 'update_agent_role', 'delete_agent_role'],
  manage_role_capabilities: ['add_role_tool_permission', 'remove_role_tool_permission', 'add_role_workflow_permission', 'remove_role_workflow_permission'],
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
