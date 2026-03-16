# Roadmap - ad-product-forge
## PRDs Consolidados

**Última Atualização:** 2026-03-16
**Total de PRDs Válidos:** 29
**Status:** 6 Fases de Implementação

---

## 📊 Referência Rápida de PRDs

| ID | Título | Frente | Status |
|----|---|---|---|
| PRD-01 | Database-Driven Agent System | 1 | ✅ Fase 1 |
| PRD-02 | Sistema de Agentes Externos | 4 | ✅ Fase 2 |
| PRD-03 | Agent Hiring Workflow | 4 | ✅ Fase 4 |
| PRD-04 | Agent Termination Workflow | 4 | ✅ Fase 4 |
| PRD-05 | Application Deployment (Coolify) | 8 | ✅ Fase 6+ |
| PRD-06 | Billing & Payment Integration | 9 | ✅ Fase 6+ |
| PRD-07 | Browser Service | 8 | ✅ Fase 3 |
| PRD-08 | Cash Flow Control | 9 | ⏸️ (Parte de PRD-22) |
| PRD-10 | Cron/Scheduling Tool + Heartbeat | 6 | ✅ Fase 2 |
| PRD-11 | Custom Tool Framework | 12 | ⏸️ Fase 6+ |
| PRD-12 | Serviços de Infraestrutura Compartilhada | 8 | ⏸️ Em Aberto |
| PRD-16 | GitHub Integration (Config) | 7 | ✅ Fase 6+ |
| PRD-18 | Internal Group Chat (Participants) | 5 | ✅ Fase 3 |
| PRD-19 | Knowledge Base (Mastra Workspace) | 10 | ✅ Fase 4 |
| PRD-20 | Marketing Artifact Generation Tools | 11 | ✅ Fase 6+ |
| PRD-21 | Marketing Platform Integration | 11 | ⏸️ Fase 6+ |
| PRD-22 | Micro-ERP System (Fluxo de Caixa) | 9 | ✅ Fase 5 ⭐ PRIORITÁRIO |
| PRD-23 | Gerenciamento de Grupos por Provedor | 5 | ✅ Fase 6+ |
| PRD-24 | Project & Task Management | 9 | ✅ Fase 6+ |
| PRD-25 | Research as Workflow | 12 | ✅ Fase 2 |
| PRD-26 | Role and Function Schema | 3 | ✅ Fase 5 |
| PRD-27 | Secrets Management | 2 | ✅ Fase 1 |
| PRD-28 | Social Media & Community Integration | 11 | ✅ Fase 6+ |
| PRD-29 | Sub-agent Capability (Opcional) | 12 | ⚠️ Fase 6+ |
| PRD-31 | Ticketing System as Provider | 5 | ✅ Fase 6+ |
| PRD-32 | Web Application Templates | 8 | ✅ Fase 6+ |
| PRD-33 | Webhook Event Routing System | 7 | ✅ Fase 6+ |

---

## 🚀 Ordem de Implementação - 6 Fases

### **Fase 1: Fundação Essencial** (2 PRDs)

1. **PRD-01** - Database-Driven Agent System
   - Bloqueador absoluto
   - SQLite + Drizzle, schemas, migrations
   - Carregamento dinâmico de agentes
   - Complexidade: ALTA

2. **PRD-27** - Secrets Management
   - Criptografia AES-256-GCM
   - Armazenar/recuperar credenciais
   - Complexidade: MÉDIA

---

### **Fase 2: Agendamentos + Ferramentas Básicas** (3 PRDs)

3. **PRD-10** - Cron/Scheduling Tool + Heartbeat System
   - Node-schedule integration
   - Database de agendamentos
   - **Tabela de Notificações** (refactoring - tirar Read/Unread do módulo de comunicação)
   - Heartbeat periódico
   - Detecção de tarefas pendentes
   - Debounce
   - Complexidade: MÉDIA (+ refactoring)

4. **PRD-02** - External Agent System
   - Criar agentes externos (consultores, personas)
   - Flags no banco de dados (is_external, parent_agent_id)
   - Usa chat interno para comunicação
   - Pode ser terminado quando tarefa se completa
   - Complexidade: MÉDIA

5. **PRD-25** - Research as Workflow
   - Transformar Research de Tool para Workflow Mastra
   - Usar padrão workflow Mastra
   - Complexidade: MÉDIA-BAIXA

---

### **Fase 3: Comunicação + Browser** (2 PRDs)

6. **PRD-18** - Internal Group Chat Implementation (Participants)
   - Provedor de chat interno com suporte a grupos
   - Persistência de mensagens
   - Sistema de não lidos (movido para PRD-10)
   - Participants (múltiplos destinatários)
   - Integração para receber crons/agendamentos
   - Complexidade: ALTA

7. **PRD-07** - Browser Service
   - Serviço externo de browser para agentes
   - Investigar OpenClaw ou serviço similar
   - Complexidade: MÉDIA (investigação)

---

### **Fase 4: Agentes Operacionais + Conhecimento** (3 PRDs)

8. **PRD-03** - Agent Hiring Workflow
   - Workflow Mastra para criar agentes
   - Registrar no database
   - Registrar provider de comunicação
   - Atribuir função (role) simples/default
   - System prompt
   - Complexidade: MÉDIA

9. **PRD-04** - Agent Termination Workflow
   - Workflow Mastra para desligar agentes
   - Análogo ao hiring
   - Complexidade: MÉDIA

10. **PRD-19** - Knowledge Base System (Mastra Workspace)
    - Usar workspace do Mastra para embeddings
    - Busca semântica + full-text
    - GraphRAG para análise relacional
    - Integrada com ERP
    - Similar ao que foi desenvolvido para memória de longo prazo
    - Complexidade: ALTA

---

### **Fase 5: Accountability + Organização** (3 PRDs)

11. **PRD-22** - Micro-ERP System (Fluxo de Caixa) ⭐ PRIORITÁRIO
    - "Caixa da empresa" centralizado
    - Rastrear: custos (agentes, APIs, infraestrutura) + receitas
    - Contas a pagar/receber com histórico
    - Saldo disponível + previsões
    - **Views customizadas** - agentes criam suas próprias visualizações
    - **Queries diretas** - agentes rodam SQL com escopo limitado
    - Folha de pagamento (custo por agente)
    - Mecanismo de accountability - agentes gerenciam recursos reais
    - Complexidade: ALTA

12. **PRD-26** - Role and Function Schema
    - Schema de roles/functions
    - **Definir que Tools estão disponíveis** por role
    - **Tools para agentes gerenciarem roles** de outros agentes
    - Validação de permissões em tempo real
    - **Recarregamento dinâmico** de tools quando roles mudam
    - Master agent com permissão irrestrita
    - Complexidade: **MUITO ALTA** (governança complexa)

13. **PRD-23** - Gerenciamento de Grupos por Provedor
    - Tools para agentes criarem/gerenciarem grupos em cada provedor
    - Discord: Criar canais, gerenciar membros
    - Email: Listas de distribuição, CC/BCC
    - Depende de PRD-18 (participants definido no chat interno)
    - Complexidade: MÉDIA

---

### **Fase 6+: Integrações Complexas e Resto**

14. **PRD-33** - Webhook Event Routing System
15. **PRD-06** - Billing & Payment Integration
16. **PRD-05** - Application Deployment (Coolify)
17. **PRD-20** - Marketing Artifact Generation Tools
18. **PRD-28** - Social Media & Community Integration
19. **PRD-32** - Web Application Templates
20. **PRD-24** - Project & Task Management
21. **PRD-16** - GitHub Integration (config + investigação)
22. **PRD-21** - Marketing Platform Integration (adiado)
23. **PRD-29** - Sub-agent Capability (opcional)
24. **PRD-11** - Custom Tool Framework (adiado)
25. **PRD-12** - Serviços de Infraestrutura Compartilhada (em aberto)
26. **PRD-08** - Cash Flow Control (integrado a PRD-22)
27. **PRD-31** - Ticketing System as Provider

---

## Dependências Críticas

| PRD | Depende De | Bloqueia |
|-----|-----------|----------|
| PRD-01 | Nenhum | TUDO |
| PRD-27 | PRD-01 | Todos com credenciais |
| PRD-10 | PRD-01 | Nenhum (refactoring interno) |
| PRD-02 | PRD-01, PRD-18 | Nenhum |
| PRD-25 | PRD-01 | Nenhum |
| PRD-18 | PRD-01, PRD-27 | PRD-10 (notificações), PRD-23 |
| PRD-07 | Investigação | Nenhum |
| PRD-03 | PRD-01, PRD-10 (opcional) | PRD-26 (depois) |
| PRD-04 | PRD-01, PRD-10 (opcional) | PRD-26 (depois) |
| PRD-19 | PRD-01, PRD-22 (depois) | Nenhum |
| PRD-22 | PRD-01 | PRD-06, PRD-26 |
| PRD-26 | PRD-01, PRD-22 | Nenhum |
| PRD-33 | PRD-01, PRD-18 | PRD-05, PRD-06 |
| PRD-06 | PRD-01, PRD-22, PRD-33 | Nenhum |
| PRD-05 | PRD-01, PRD-33 | Nenhum |
| PRD-23 | PRD-18 | Nenhum |

---

## 12 Frentes Estratégicas

### Frente 1: Persistência e Configuração Dinâmica de Agentes
**Objetivo:** Migrar de agentes fixa para dinâmica, persistida em banco de dados
**PRDs:** PRD-01

### Frente 2: Segurança e Gestão de Credenciais
**Objetivo:** Proteger dados sensíveis (tokens, senhas, credenciais)
**PRDs:** PRD-01, PRD-27

### Frente 3: Papéis, Funções e Governança Organizacional
**Objetivo:** Schema de papéis/funções para RBAC e organização interna
**PRDs:** PRD-26

### Frente 4: Workflows de Contratação, Demissão e Operação
**Objetivo:** Ciclo de vida estruturado de agentes
**PRDs:** PRD-02, PRD-03, PRD-04

### Frente 5: Comunicação Interna e Externa
**Objetivo:** Evolução de comunicação para suportar grupos e múltiplos provedores
**PRDs:** PRD-18, PRD-23, PRD-31

### Frente 6: Despertadores, Agendamentos e Continuidade
**Objetivo:** Heartbeat e agendamentos para manter agentes ativos
**PRDs:** PRD-10

### Frente 7: Eventos Externos e Automação Orientada a Gatilhos
**Objetivo:** Receber e rotear eventos externos para agentes
**PRDs:** PRD-05, PRD-06, PRD-33

### Frente 8: Desenvolvimento, Deploy e Infraestrutura Base
**Objetivo:** Templates, deploy automatizado e infraestrutura base
**PRDs:** PRD-05, PRD-07, PRD-12, PRD-32

### Frente 9: Operação de Negócio - Fluxo de Caixa e ERP
**Objetivo:** Gestão operacional da empresa digital com responsabilidade e accountability
**PRDs:** PRD-06, PRD-08, PRD-22, PRD-24

### Frente 10: Conhecimento, Memória e Busca Semântica
**Objetivo:** Base de conhecimento compartilhada com busca semântica
**PRDs:** PRD-19, PRD-29

### Frente 11: Marketing, Presença Pública e Canais de Divulgação
**Objetivo:** Artefatos de marketing e integração com plataformas públicas
**PRDs:** PRD-20, PRD-21, PRD-28

### Frente 12: Autonomia Progressiva - Criação de Ferramentas
**Objetivo:** Agentes criam suas próprias Tools e integrações
**PRDs:** PRD-11, PRD-25

---

## Descartes / Não Mais PRDs

| ID | Nome | Razão |
|----|---|---|
| PRD-09 | CRM System | Descartado (agentes usam seus próprios apps) |
| PRD-13 | Domain Management | Config, não PRD |
| PRD-14 | Electronic Signature | Descartado |
| PRD-15 | Email Service Integration | Config (SMTP/IMAP existente) |
| PRD-17 | Heartbeat System | Integrado a PRD-10 |
| PRD-30 | Task Queue Event Processing | **Não existe** - Task Queue é parte de PRD-12 |

---

## ⚠️ Decisões Importantes

- ✅ **PRD-26 (Roles) adiado para Fase 5** - Muito complexo (governança, recarregamento dinâmico de tools)
- ✅ **PRD-10 inclui refactoring de notificações** - Tabela nova, tirar Read/Unread do chat
- ✅ **Email organizacional é CONFIG** (domínio + SMTP), não PRD
- ✅ **GitHub é CONFIG + investigação** (GitHub App vs conta por agente)
- ✅ **MinIO + BullMQ em aberto** - Serviços compartilhados, não imediato
- ✅ **PRD-22 ⭐ PRIORITÁRIO** - Mecanismo core de accountability em Fase 5
- ✅ **5 PRDs descartados** - PRD-09, 13, 14, 15, 17, 30

---

## 📊 Resumo Executivo

**28 PRDs válidos** organizados em **6 fases de implementação** cobrindo **12 frentes estratégicas**.

- **Fase 1:** Fundação (PRD-01, PRD-27)
- **Fase 2:** Agendamentos + Ferramentas (PRD-10, PRD-02, PRD-25)
- **Fase 3:** Comunicação + Browser (PRD-18, PRD-07)
- **Fase 4:** Agentes + Conhecimento (PRD-03, PRD-04, PRD-19)
- **Fase 5:** Accountability ⭐ (PRD-22, PRD-26, PRD-23)
- **Fase 6+:** Integrações (PRD-33, PRD-06, PRD-05, e mais)

---

**Referência detalhada disponível em [docs/VISION.md](./docs/VISION.md)**
