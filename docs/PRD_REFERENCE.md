# Referência Completa de PRDs (Corrigida)

**Data:** 2026-03-16
**Propósito:** Mapeamento exato entre ID PRD e nome do arquivo

---

## Lista Completa (30 PRDs)

| ID | Nome do Arquivo | Título | Frente |
|----|---|---|---|
| PRD-01 | database-driven-agent-system | Database-Driven Agent System | 1 |
| PRD-02 | external-agent-system | Sistema de Agentes Externos | 4 |
| PRD-03 | agent-hiring-workflow | Agent Hiring Workflow | 4 |
| PRD-04 | agent-termination-workflow | Agent Termination Workflow | 4 |
| PRD-05 | application-deployment | Application Deployment (Coolify) | 8 |
| PRD-06 | billing-payment-integration | Billing & Payment Integration | 9 |
| PRD-07 | browser-service | Browser Service | 8 |
| PRD-08 | cash-flow-control | Cash Flow Control | 9 |
| PRD-10 | cron-scheduling-tool | Cron/Scheduling Tool + Heartbeat | 6 |
| PRD-11 | custom-tool-framework | Custom Tool Framework | 12 |
| PRD-12 | distributed-storage-system | Serviços de Infraestrutura Compartilhada (MinIO + BullMQ - Em Aberto) | 8 |
| PRD-16 | github-integration | GitHub Integration (Config) | 7 |
| PRD-18 | internal-group-chat-implementation | Internal Group Chat (Participants) | 5 |
| PRD-19 | knowledge-base-system | Knowledge Base (Mastra Workspace) | 10 |
| PRD-20 | marketing-artifact-generation-tools | Marketing Artifact Generation Tools | 11 |
| PRD-21 | marketing-platform-integration | Marketing Platform Integration | 11 |
| PRD-22 | micro-erp-system | Micro-ERP System (Fluxo de Caixa) | 9 |
| PRD-23 | multi-provider-group-support | Multi-Provider Group Support | 5 |
| PRD-24 | project-task-management | Project & Task Management (Integração) | 9 |
| PRD-25 | research-as-workflow | Research as Workflow | 12 |
| PRD-26 | role-and-function-schema | Role and Function Schema | 3 |
| PRD-27 | secrets-management | Secrets Management | 2 |
| PRD-28 | social-media-community-integration | Social Media & Community Integration | 11 |
| PRD-29 | sub-agent-capability | Sub-agent Capability (Opcional) | 12 |
| PRD-31 | ticketing-system | Ticketing System as Provider | 5 |
| PRD-32 | web-application-templates | Web Application Templates | 8 |
| PRD-33 | webhook-event-routing-system | Webhook Event Routing System | 7 |

---

## Descartes / Não Mais PRDs

| ID | Nome | Razão |
|----|---|---|
| PRD-09 | crm-system | Descartado (agentes usam seus próprios apps) |
| PRD-13 | domain-management | Config, não PRD |
| PRD-14 | electronic-signature | Descartado |
| PRD-15 | email-service-integration | Config (SMTP/IMAP existente) |
| PRD-17 | heartbeat-system | Integrado a PRD-10 |
| PRD-30 | task-queue-event-processing | **Não existe** - Task Queue é parte de PRD-12 (Infraestrutura Compartilhada) |

---

## Erros Encontrados e Corrigidos

1. **PRD-02:** Estava listado como "Communication Provider Integration"
   - **Correto:** PRD-02 é "External Agent System" (está em Frente 4)

2. **PRD-30:** Não deveria existir
   - **Correto:** Task Queue é parte de PRD-12 (Infraestrutura Compartilhada)

3. **PRD-12:** Deveria descrever serviços compartilhados (MinIO + BullMQ)
   - **Correto:** PRD-12 = Serviços de Infraestrutura Compartilhada (em aberto)

---

## Próximas Ações

1. Corrigir ROADMAP_MAPPING.md
2. Reescrever PRD_DEPENDENCIES.md com dados corretos
3. Revisar plano de fases

---

**Fim do documento**
