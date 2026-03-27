# SPEC - Ad Product Forge

> **Versão:** 1.0.0  
> **Última atualização:** 27/03/2026  
> **Autora:** Wiki Witch Writa  
> **PO/PM:** Quest Master

## Visão Geral do Produto

**Ad Product Forge** é uma plataforma de gestão de agentes de IA internos que permite à empresa Alternative Down contratar, configurar, monitorar e encerrar agentes de forma autônoma e controlada financeiramente.

## Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                     AD PRODUCT FORGE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    FORGE-ADMIN                          │   │
│  │              (Next.js Admin UI)                          │   │
│  │   - Dashboard de agentes                                │   │
│  │   - Contratos e orçamentos                              │   │
│  │   - Permissões e roles                                  │   │
│  │   - Integrações (GitHub, Coolify)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           │ REST API                            │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      FORGE                               │   │
│  │               (Backend/Agent Runtime)                    │   │
│  │   - Agent Runtime (Mastra)                              │   │
│  │   - Ferramentas (Tools)                                 │   │
│  │   - Capacidades (Capabilities)                          │   │
│  │   - Workflows (Hire, Terminate)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    DATABASE                              │   │
│  │   - Agentes, Contratos, Roles                          │   │
│  │   - Ledger Financeiro                                   │   │
│  │   - Histórico de Execuções                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Casos de Uso Principais

### UC1: Contratar Agente Interno

**Actor:** Administrador  
**Fluxo:**
1. Selecionar tipo de agente
2. Configurar capacidades e permissions
3. Definir orçamento e período do contrato
4. Executar workflow de contratação
5. Agente fica ativo e disponível

### UC2: Monitorar Execução

**Actor:** Administrador, Financeiro  
**Fluxo:**
1. Acessar dashboard de agentes
2. Verificar status de execução
3. Monitorar gastos vs orçamento
4. Visualizar logs e notificações

### UC3: Ajustar Orçamento

**Actor:** Financeiro  
**Fluxo:**
1. Selecionar agente
2. Definir novo limite
3. Sistema valida (cash disponível)
4. Confirmação de ajuste
5. Budget atualizado no contrato

### UC4: Encerrar Agente

**Actor:** Administrador  
**Fluxo:**
1. Selecionar agente
2. Confirmar encerramento
3. Sistema para execução
4. Salva estado e contexto
5. Agente fica inativo

## Módulos Principais

### 1. Forge Core

| Componente | Responsabilidade |
|------------|------------------|
| `forge/src/agents/` | Lógica de agentes |
| `forge/src/capabilities/` | Sistema de permissões |
| `forge/src/workflows/` | Workflows de negócio |
| `forge/src/tools/` | Ferramentas disponíveis |

### 2. Admin UI

| Componente | Responsabilidade |
|------------|------------------|
| `forge-admin/` | Interface Next.js |
| `features/agents/` | Páginas de agentes |
| `features/contracts/` | Gestão de contratos |
| `features/roles/` | Permissões e roles |

### 3. Integrações

| Integração | Capabilities |
|------------|--------------|
| GitHub | Repos, PRs, Issues, Labels, Milestones |
| Coolify | Deploys, Applications, Logs |
| Internal Chat | Mensagens, Grupos, Notificações |

## Fluxos de Usuário

### Fluxo 1: Contratação de Agente

```
Admin → Forge-Admin → POST /admin/agent/hire → Workflow Hire
                                            ↓
                                    Criar Função
                                            ↓
                                    Configurar Caps
                                            ↓
                                    Criar Contrato
                                            ↓
                                    Agente Ativo
```

### Fluxo 2: Delegação de Tarefa

```
Coordinator → create_task_for_agent
                         ↓
              Tarefa Criada (pending)
                         ↓
              Agent Notificado
                         ↓
              Agent Executa
                         ↓
              Status Atualizado
```

## Requisitos Não-Funcionais

| Requisito | Target |
|-----------|--------|
| Disponibilidade | 99.5% |
| Tempo de resposta API | < 500ms |
| Concorrência | 50+ agentes simultâneos |
| Retenção de dados | 90 dias histórico |

## Pré-requisitos

- Node.js 20+
- PostgreSQL (via Turso/Drizzle)
- Coolify para deployment
- GitHub App para integrações

## Roadmap

| Fase | Funcionalidade | Status |
|------|---------------|--------|
| 1 | Core agent system | ✅ Done |
| 2 | Hiring workflow | ✅ Done |
| 3 | Budget management | ✅ Done |
| 4 | Permissions system | ✅ Done |
| 5 | Agent-to-agent tasks | 🔄 In Progress |
| 6 | Advanced scheduling | 📋 Planned |

---

**Tags:** `spec` `architecture` `overview`
