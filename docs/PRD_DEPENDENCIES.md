# Mapa de Dependências entre PRDs (Final)

**Data:** 2026-03-16
**Propósito:** Ordem de implementação baseada em simplicidade, fundação e dependências
**Total de PRDs Válidos:** 29

---

## Ordem de Implementação - 6 Fases

### **Fase 1: Fundação Essencial**

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

### **Fase 2: Agendamentos + Ferramentas Básicas**

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

### **Fase 3: Comunicação + Browser**

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

### **Fase 4: Agentes Operacionais + Conhecimento**

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

### **Fase 5: Accountability + Organização**

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

**Nota Adicional:**

16. **PRD-23** - Gerenciamento de Grupos por Provedor
    - Tools para agentes criarem/gerenciarem grupos em cada provedor
    - Discord: Criar canais, gerenciar membros
    - Email: Listas de distribuição, CC/BCC
    - Depende de PRD-18 (participants definido no chat interno)
    - Complexidade: MÉDIA

---

### **Fase 6+: Integrações Complexas e Resto**

13. **PRD-33** - Webhook Event Routing System
    - Receber e rotear webhooks para agentes
    - Integração com GitHub, Coolify, Stripe, Asaas
    - Wake-up de agentes em eventos
    - Complexidade: ALTA

14. **PRD-06** - Billing & Payment Integration
    - Stripe + Asaas integration
    - Webhooks de pagamentos
    - Registrar transações em PRD-22 (ERP)
    - Complexidade: MÉDIA-ALTA

15. **PRD-05** - Application Deployment (Coolify)
    - Workflow Mastra para deploy
    - Usa Coolify em Hetzner
    - Webhooks para status de deploy
    - Complexidade: ALTA

16. **PRD-23** - Multi-Provider Group Support
    - Extensão de PRD-18 para Discord, Email
    - Suporte a grupos em múltiplos providers
    - Email com CC/BCC
    - Complexidade: MÉDIA

---

### **Fase 7: Investigação/Aberto/Adiado**

17. **PRD-20** - Marketing Artifact Generation Tools
18. **PRD-28** - Social Media & Community Integration (Buffer + investigação)
19. **PRD-32** - Web Application Templates
20. **PRD-24** - Project & Task Management (integração com ferramenta externa)
21. **PRD-11** - Custom Tool Framework (adiado)
22. **PRD-21** - Marketing Platform Integration (adiado, investigação)
23. **PRD-29** - Sub-agent Capability (opcional, avaliar viabilidade)
24. **PRD-16** - GitHub Integration (config + investigação)
25. **PRD-12** - Serviços de Infraestrutura Compartilhada (MinIO + BullMQ - em aberto)
26. **PRD-08** - Cash Flow Control (integrado a PRD-22, pode ser parte dele)

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

## Notas Importantes

1. **PRD-01 é bloqueador absoluto** - Nada funciona sem database
2. **PRD-10 traz mudança arquitetural** - Cria tabela de notificações, refatora Read/Unread
3. **PRD-18 é base para comunicação** - Necessário para receber notificações, agendamentos
4. **PRD-22 é mecanismo core** - Accountability dos agentes em Fase 5
5. **PRD-26 é muito complexo** - Deixado para Fase 5, quando já tem base
6. **Fases 1-4 = MVP funcional** - Agentes podem operar, agendar, se comunicar, existir
7. **Fase 5 = Accountability e Organização** - Com ERP e Roles
8. **Fase 6+ = Complexidade e Integrações** - Deploy, webhooks, pagamentos

---

**Fim do documento**
