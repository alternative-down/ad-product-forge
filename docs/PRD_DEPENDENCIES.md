# Mapa de Dependências entre PRDs (Corrigido)

**Data:** 2026-03-16
**Propósito:** Identificar ordem correta de implementação baseada em dependências
**Referência:** PRD_REFERENCE.md

---

## Dependências Críticas (Bloqueadores)

### P0 - Fundação Absoluta

**PRD-01: Database-Driven Agent System**
- ✅ Nenhuma dependência anterior
- ⬇️ Bloqueador para: PRD-02, PRD-03, PRD-04, PRD-22, PRD-23, PRD-24, PRD-26, PRD-27
- **Razão:** Toda persistência depende de banco de dados

**PRD-27: Secrets Management**
- ⬆️ Depende de: PRD-01 (database para armazenar credenciais criptografadas)
- ⬇️ Bloqueador para: Todos os PRDs que usam credenciais/providers
- **Razão:** Segurança de credenciais necessária cedo

---

## P1 - Infraestrutura Core de Comunicação e Agentes

**PRD-18: Internal Group Chat Implementation (Participants)**
- ⬆️ Depende de: PRD-01, PRD-27 (se armazenar credenciais)
- ⬇️ Bloqueador para: PRD-10, PRD-23, PRD-31
- **Razão:** Chat interno é base para notificações e comunicação entre agentes

**PRD-26: Role and Function Schema**
- ⬆️ Depende de: PRD-01
- ⬇️ Bloqueador para: PRD-03, PRD-04 (workflows precisam de roles definidos)
- **Razão:** Estrutura de permissões/funções para agentes

**PRD-03: Agent Hiring Workflow**
- ⬆️ Depende de: PRD-01, PRD-26
- **Razão:** Precisa de database e roles definidos

**PRD-04: Agent Termination Workflow**
- ⬆️ Depende de: PRD-01, PRD-26
- **Razão:** Análogo ao hiring, mesmas dependências

**PRD-02: External Agent System**
- ⬆️ Depende de: PRD-01, PRD-18 (usa chat interno para comunicação)
- **Razão:** Criação de agentes externos para tarefas específicas

**PRD-10: Cron/Scheduling Tool + Heartbeat System**
- ⬆️ Depende de: PRD-01, PRD-18 (chat interno para notificações)
- **Razão:** Precisa enviar mensagens via chat interno

---

## P2 - Operação e Gestão Financeira

**PRD-22: Micro-ERP System (Fluxo de Caixa)**
- ⬆️ Depende de: PRD-01
- ⬇️ Bloqueador para: PRD-06 (integração de pagamentos)
- **Razão:** Core para accountability dos agentes, gestão de recursos

**PRD-06: Billing & Payment Integration**
- ⬆️ Depende de: PRD-01, PRD-22 (registrar transações)
- **Razão:** Integração com Stripe/Asaas precisa registrar no ERP

**PRD-23: Multi-Provider Group Support**
- ⬆️ Depende de: PRD-18 (participants base)
- **Razão:** Extensão de PRD-18 para múltiplos providers

**PRD-31: Ticketing System as Provider**
- ⬆️ Depende de: PRD-18 (participants), PRD-01 (database)
- **Razão:** Integração como provider de comunicação

**PRD-24: Project & Task Management (Integração com Ferramenta Externa)**
- ⬆️ Depende de: PRD-01 (armazenar credenciais)
- **Razão:** Integração com Linear, Airtable, Notion, etc.

---

## P3 - Automação e Eventos

**PRD-33: Webhook Event Routing System**
- ⬆️ Depende de: PRD-01, PRD-18 (rotear para agentes via chat interno)
- ⬇️ Bloqueador para: PRD-05, PRD-06 (webhooks de deploy, pagamentos)
- **Razão:** Infraestrutura de eventos/webhooks

**PRD-05: Application Deployment (Coolify)**
- ⬆️ Depende de: PRD-01, PRD-33 (webhooks), workflows Mastra
- **Razão:** Deploy precisa de webhook support

**PRD-25: Research as Workflow**
- ⬆️ Depende de: PRD-01 (framework Mastra)
- **Razão:** Transformação de Tool para Workflow Mastra

---

## P4 - Conhecimento e Inteligência

**PRD-19: Knowledge Base System (Mastra Workspace)**
- ⬆️ Depende de: PRD-01, PRD-22 (ERP como backend)
- **Razão:** Base de conhecimento integrada com ERP

**PRD-20: Marketing Artifact Generation Tools**
- ⬆️ Depende de: PRD-01, PRD-27 (credenciais de APIs)
- **Razão:** Tools para imagens, vídeos, áudio

---

## P5 - Deploy e Templates

**PRD-32: Web Application Templates**
- ⬆️ Depende de: PRD-01 (opcional, para armazenar templates)
- **Razão:** Pode ser criado com independência relativa

---

## P6 - Presença Pública e Extensibilidade

**PRD-28: Social Media & Community Integration**
- ⬆️ Depende de: PRD-01, PRD-27 (credenciais)
- **Nota:** Buffer (P1), Monitoramento/Fóruns (investigação)
- **Razão:** Integração com redes sociais

**PRD-21: Marketing Platform Integration**
- ⬆️ Depende de: PRD-01, PRD-27
- **Status:** Adiado, investigação necessária

**PRD-11: Custom Tool Framework**
- ⬆️ Depende de: PRD-01
- **Status:** Adiado, investigação necessária

**PRD-29: Sub-agent Capability**
- ⬆️ Depende de: PRD-01, PRD-02
- **Status:** Opcional, avaliar viabilidade

---

## P7 - Investigação / Em Aberto

**PRD-07: Browser Service**
- **Status:** Investigação necessária (OpenClaw ou serviço externo)

**PRD-16: GitHub Integration**
- **Status:** Questão em aberto (GitHub App vs conta por agente)
- **Nota:** Tratado como config + investigação em PRD-33 (webhooks)

**PRD-12: Serviços de Infraestrutura Compartilhada (MinIO + BullMQ)**
- **Status:** Em aberto, esperar necessidade surgir
- **Nota:** Recursos compartilhados que agentes podem usar em suas aplicações, não features da plataforma

---

## Ordem Recomendada de Implementação

### Fase 1: Fundação (BLOQUEADORES CRÍTICOS)
1. **PRD-01** - Database-Driven Agent System
2. **PRD-27** - Secrets Management

### Fase 2: Comunicação e Agentes
3. **PRD-18** - Internal Group Chat Implementation (Participants)
4. **PRD-26** - Role and Function Schema
5. **PRD-03** - Agent Hiring Workflow
6. **PRD-04** - Agent Termination Workflow
7. **PRD-02** - External Agent System
8. **PRD-10** - Cron/Scheduling + Heartbeat

### Fase 3: Operação Core
9. **PRD-22** - Micro-ERP System (Fluxo de Caixa) ⭐ PRIORITÁRIO
10. **PRD-23** - Multi-Provider Group Support
11. **PRD-31** - Ticketing System as Provider

### Fase 4: Automação e Integração
12. **PRD-33** - Webhook Event Routing System
13. **PRD-06** - Billing & Payment Integration
14. **PRD-05** - Application Deployment (Coolify)

### Fase 5: Inteligência e Conhecimento
15. **PRD-25** - Research as Workflow
16. **PRD-19** - Knowledge Base System
17. **PRD-20** - Marketing Artifact Generation

### Fase 6: Capacidades Avançadas
18. **PRD-32** - Web Application Templates
19. **PRD-24** - Project & Task Management (Integração)
20. **PRD-28** - Social Media & Community (Buffer + investigação)

### Fase 7: Investigação/Aberto
21. **PRD-07** - Browser Service (investigação)
22. **PRD-16** - GitHub Integration (investigação)
23. **PRD-11** - Custom Tool Framework (adiado)
24. **PRD-21** - Marketing Platform Integration (adiado)
25. **PRD-29** - Sub-agent Capability (opcional)
26. **PRD-12** - Serviços de Infraestrutura Compartilhada (em aberto)

---

## Notas Críticas

1. **PRD-01 é bloqueador absoluto** - Base de tudo
2. **PRD-27 é bloqueador crítico** - Segurança necessária cedo
3. **PRD-18 é bloqueador para comunicação** - Chat interno necessário para notificações
4. **PRD-26 precisa vir antes de PRD-03/04** - Roles precisam estar definidos
5. **PRD-22 é core para accountability** - Implementar cedo (Fase 3)
6. **PRD-33 é importante para automação** - Webhooks necessários para eventos
7. **PRD-02 é mais avançado que PRD-03/04** - Agentes externos vêm depois dos internos
8. **PRD-12 não é uma feature** - É infraestrutura compartilhada que fica disponível, sem timeline urgente

---

**Fim do documento**
