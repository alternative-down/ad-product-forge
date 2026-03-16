# Mapa de Dependências entre PRDs

**Data:** 2026-03-16
**Propósito:** Identificar quais PRDs precisam ser implementados antes de outros

---

## Dependências Críticas (Deve-Fazer Primeiro)

### P0 - Fundação Absoluta
Estes DEVEM ser feitos primeiro. Sem eles, nada funciona.

**PRD-01: Database-Driven Agent System**
- ✅ Nenhuma dependência anterior
- ⬇️ Depende disso: PRD-02, PRD-03, PRD-04, PRD-22, PRD-23, PRD-24, PRD-26, PRD-27
- **Razão:** Toda persistência depende de banco de dados

**PRD-02: Communication Provider Integration**
- ⬆️ Depende de: PRD-01 (database)
- ⬇️ Depende disso: PRD-18, PRD-23, PRD-31
- **Razão:** Base para comunicação interna/externa

**PRD-27: Secrets Management**
- ⬆️ Depende de: PRD-01 (database)
- ⬇️ Depende disso: PRD-02 (armazenar credenciais)
- **Razão:** Segurança de credenciais necessária cedo

---

## P1 - Infraestrutura Core de Agentes

**PRD-03: Agent Hiring Workflow**
- ⬆️ Depende de: PRD-01, PRD-02, PRD-26
- **Razão:** Precisa de database, providers, e roles definidos

**PRD-04: Agent Termination Workflow**
- ⬆️ Depende de: PRD-01, PRD-02, PRD-26
- **Razão:** Análogo ao hiring, mesmas dependências

**PRD-26: Role and Function Schema**
- ⬆️ Depende de: PRD-01
- ⬇️ Depende disso: PRD-03, PRD-04
- **Razão:** Estrutura de permissões precisa estar definida

**PRD-10: Cron/Scheduling + Heartbeat System**
- ⬆️ Depende de: PRD-01, PRD-02 (chat interno para mensagens)
- **Razão:** Precisa do chat interno para notificações

**PRD-18: Internal Group Chat Implementation**
- ⬆️ Depende de: PRD-01, PRD-02
- ⬇️ Depende disso: PRD-10, PRD-23, PRD-31
- **Razão:** Base para comunicação e notificações

---

## P2 - Operação e Gestão

**PRD-22: Micro-ERP System (Fluxo de Caixa)**
- ⬆️ Depende de: PRD-01 (database)
- **Razão:** Core para accountability dos agentes

**PRD-23: Multi-Provider Group Support**
- ⬆️ Depende de: PRD-18 (participants base), PRD-02 (providers)
- **Razão:** Extensão de PRD-18 para múltiplos providers

**PRD-31: Ticketing System as Provider**
- ⬆️ Depende de: PRD-18 (participants), PRD-02 (provider registration)
- **Razão:** Integração como provider de comunicação

**PRD-24: Project & Task Management (via ferramenta externa)**
- ⬆️ Depende de: PRD-01 (para armazenar credenciais/configs)
- **Razão:** Integração com ferramenta existente

---

## P3 - Desenvolvimento e Deploy

**PRD-05: Application Deployment (Coolify)**
- ⬆️ Depende de: PRD-01, PRD-02 (workflow Mastra), PRD-33 (webhooks)
- **Razão:** Precisa workflows e webhook support

**PRD-32: Web Application Templates**
- ⬆️ Depende de: PRD-01 (opcional, para armazenar templates)
- **Razão:** Pode ser criado independentemente, mas templates podem referenciar recursos

**PRD-06: Billing & Payment Integration**
- ⬆️ Depende de: PRD-01, PRD-22 (ERP, para registrar transações)
- **Razão:** Integração com fluxo financeiro

**PRD-20: Marketing Artifact Generation Tools**
- ⬆️ Depende de: PRD-01 (armazenar credenciais de APIs)
- **Razão:** Ferramentas precisam de credenciais gerenciadas

---

## P4 - Automação e Eventos

**PRD-33: Webhook Event Routing System**
- ⬆️ Depende de: PRD-01, PRD-02 (roteador para agentes)
- ⬇️ Depende disso: PRD-05 (webhooks de deploy), PRD-06 (webhooks de pagamento)
- **Razão:** Infraestrutura de eventos

**PRD-25: Research as Workflow**
- ⬆️ Depende de: PRD-01 (framework Mastra, workflows)
- **Razão:** Transformação de Tool para Workflow

**PRD-19: Knowledge Base System (Mastra Workspace)**
- ⬆️ Depende de: PRD-22 (ERP como backend), PRD-01 (framework)
- **Razão:** Base de conhecimento integrada com ERP

---

## P5 - Investigação / Aberto

**PRD-07: Browser Service**
- ⬆️ Depende de: (investigação necessária)
- **Status:** Investigação necessária (OpenClaw ou serviço externo)

**PRD-16: GitHub Integration**
- ⬆️ Depende de: (investigação necessária sobre GitHub App vs conta por agente)
- **Status:** Questão em aberto

**PRD-28: Social Media & Community Integration**
- ⬆️ Depende de: PRD-02 (providers), PRD-27 (credenciais)
- **Status:** Buffer como P1, investigação necessária para monitoramento/fóruns

**PRD-29: Sub-agent Capability**
- ⬆️ Depende de: PRD-01, PRD-02
- **Status:** Opcional, avaliar viabilidade

**PRD-12: MinIO Storage**
- ⬆️ Depende de: (nenhuma, serviço externo compartilhado)
- **Status:** Em aberto, esperar necessidade surgir

**PRD-30: Task Queue & Event Processing**
- ⬆️ Depende de: PRD-01 (opcional, para persistência)
- **Status:** Pode usar Redis local ou investigate BullMQ

---

## Ordem Recomendada de Implementação

### Fase 1: Fundação (Bloqueadores)
1. **PRD-01** - Database-Driven Agent System
2. **PRD-27** - Secrets Management
3. **PRD-02** - Communication Provider Integration

### Fase 2: Agentes e Estrutura
4. **PRD-26** - Role and Function Schema
5. **PRD-03** - Agent Hiring Workflow
6. **PRD-04** - Agent Termination Workflow
7. **PRD-18** - Internal Group Chat Implementation

### Fase 3: Operação Core
8. **PRD-10** - Cron/Scheduling + Heartbeat
9. **PRD-22** - Micro-ERP (Fluxo de Caixa)
10. **PRD-23** - Multi-Provider Group Support
11. **PRD-31** - Ticketing System as Provider

### Fase 4: Deploy e Produção
12. **PRD-33** - Webhook Event Routing
13. **PRD-05** - Application Deployment
14. **PRD-32** - Web Application Templates
15. **PRD-06** - Billing & Payment Integration

### Fase 5: Capacidades Avançadas
16. **PRD-24** - Project & Task Management (integração)
17. **PRD-25** - Research as Workflow
18. **PRD-19** - Knowledge Base System
19. **PRD-20** - Marketing Artifact Generation
20. **PRD-28** - Social Media (Buffer + investigação)

### Fase 6: Investigação/Aberto
21. **PRD-07** - Browser Service (investigação)
22. **PRD-16** - GitHub Integration (investigação)
23. **PRD-29** - Sub-agent Capability (opcional)
24. **PRD-12** - MinIO Storage (em aberto)
25. **PRD-30** - Task Queue (conforme necessário)

---

## Notas Críticas

1. **PRD-01 é bloqueador absoluto** - Nada funciona sem database
2. **PRD-02 é bloqueador para comunicação** - Chat interno necessário cedo
3. **PRD-26 deve vir antes de PRD-03/04** - Roles precisam estar definidos
4. **PRD-18 é bloqueador para notificações** - PRD-10 depende disso
5. **PRD-22 é core para accountability** - Deve ser implementado cedo
6. **PRD-33 importante para automação** - Webhooks necessários para eventos

---

**Fim do documento**
