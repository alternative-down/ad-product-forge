# Roadmap - ad-product-forge

**Última Atualização:** 2026-03-16
**Status:** 28 PRDs válidos em 6 fases de implementação

---

## Visão Geral

Estruturar uma plataforma em que agentes possam operar como uma empresa digital: serem criados e geridos dinamicamente, executar tarefas, interagir entre si e com sistemas externos, desenvolver produtos, operar canais de comunicação, controlar recursos da operação e evoluir com autonomia controlada.

---

## 📊 Documentação Disponível

| Documento | Propósito |
|-----------|----------|
| [VISION.md](./VISION.md) | Anotações originais detalhadas (12 frentes) |
| [PRD_REFERENCE.md](./PRD_REFERENCE.md) | Referência de todos os 28 PRDs válidos |
| [PRD_DEPENDENCIES.md](./PRD_DEPENDENCIES.md) | Ordem de implementação em 6 fases + dependências |
| [ROADMAP_MAPPING.md](./ROADMAP_MAPPING.md) | Mapeamento de PRDs às 12 frentes estratégicas |

---

## 🚀 Fases de Implementação

### **Fase 1: Fundação Essencial** (2 PRDs)
- PRD-01: Database-Driven Agent System
- PRD-27: Secrets Management

**Objetivo:** Base de persistência e segurança

---

### **Fase 2: Agendamentos + Ferramentas Básicas** (3 PRDs)
- PRD-10: Cron/Scheduling Tool + Heartbeat (+ Tabela de Notificações)
- PRD-02: External Agent System
- PRD-25: Research as Workflow

**Objetivo:** Agendamentos, notificações, agentes externos

---

### **Fase 3: Comunicação + Browser** (2 PRDs)
- PRD-18: Internal Group Chat (Participants)
- PRD-07: Browser Service

**Objetivo:** Base de comunicação e acesso a browsers

---

### **Fase 4: Agentes Operacionais + Conhecimento** (3 PRDs)
- PRD-03: Agent Hiring Workflow
- PRD-04: Agent Termination Workflow
- PRD-19: Knowledge Base (Mastra Workspace)

**Objetivo:** Ciclo de vida de agentes + base de conhecimento

---

### **Fase 5: Accountability + Organização** (2 PRDs) ⭐
- PRD-22: Micro-ERP System (Fluxo de Caixa) **[PRIORITÁRIO]**
- PRD-26: Role and Function Schema

**Objetivo:** Controle financeiro e governança organizacional

---

### **Fase 6+: Integrações Complexas e Resto** (16+ PRDs)
- PRD-33: Webhook Event Routing System
- PRD-06: Billing & Payment Integration
- PRD-05: Application Deployment (Coolify)
- PRD-23: Gerenciamento de Grupos por Provedor
- PRD-20: Marketing Artifact Generation Tools
- PRD-28: Social Media & Community Integration
- PRD-32: Web Application Templates
- PRD-24: Project & Task Management (Integração)
- ... (resto dos PRDs em investigação/aberto)

**Objetivo:** Deploy, webhooks, marketing, templates, integrações

---

## 📋 12 Frentes Estratégicas

### **1️⃣ Persistência e Configuração Dinâmica**
- **PRD:** PRD-01
- **Objetivo:** Migrar de agentes fixos em código para dinâmica persistida em database
- **Escopo:** SQLite + Drizzle, schemas, migrations, carregamento dinâmico

### **2️⃣ Segurança e Gestão de Credenciais**
- **PRDs:** PRD-01, PRD-27
- **Objetivo:** Proteger dados sensíveis
- **Escopo:** AES-256-GCM encryption, vault centralizado, rotação de credenciais

### **3️⃣ Papéis, Funções e Governança**
- **PRD:** PRD-26 (Fase 5)
- **Objetivo:** Schema de papéis/funções para RBAC
- **Escopo:** Master agent, gerenciamento de permissões, recarregamento dinâmico de tools

### **4️⃣ Workflows de Contratação/Demissão**
- **PRDs:** PRD-03, PRD-04, PRD-02
- **Objetivo:** Ciclo de vida estruturado de agentes
- **Escopo:** Workflows Mastra, account creation, providers, agentes externos

### **5️⃣ Comunicação Interna e Externa**
- **PRDs:** PRD-18, PRD-23
- **Objetivo:** Suporte a grupos em múltiplos provedores
- **Escopo:** Chat com participants, Discord canals, Email CC/BCC, tickets

### **6️⃣ Despertadores, Agendamentos e Continuidade**
- **PRD:** PRD-10
- **Objetivo:** Heartbeat + crons para manter agentes ativos
- **Escopo:** Node-schedule, tabela de notificações, heartbeat periódico, debounce

### **7️⃣ Eventos Externos e Automação**
- **PRD:** PRD-33
- **Objetivo:** Receber eventos e rotear para agentes
- **Escopo:** Webhooks GitHub/Coolify/Stripe/Asaas, wake-up de agentes

### **8️⃣ Desenvolvimento, Deploy e Infraestrutura**
- **PRDs:** PRD-32, PRD-05, PRD-07, PRD-12
- **Objetivo:** Templates, deploy, browser, serviços compartilhados
- **Escopo:** Web templates, Coolify deploy, browser service, MinIO + BullMQ (em aberto)

### **9️⃣ Operação de Negócio (ERP/Financeiro)**
- **PRDs:** PRD-22, PRD-26, PRD-23
- **Objetivo:** Gestão operacional e fluxo de caixa
- **Escopo:** "Caixa da empresa", contas a pagar/receber, folha de pagamento, queries customizadas

### **🔟 Conhecimento, Memória e Busca Semântica**
- **PRD:** PRD-19
- **Objetivo:** Base de conhecimento compartilhada
- **Escopo:** Mastra workspace, embeddings, busca semântica, GraphRAG

### **1️⃣1️⃣ Marketing, Presença Pública e Divulgação**
- **PRDs:** PRD-20, PRD-28
- **Objetivo:** Artefatos e canais de marketing
- **Escopo:** Tools de criação (imagens, vídeos, áudio), Buffer, redes sociais, fóruns

### **1️⃣2️⃣ Autonomia Progressiva**
- **PRDs:** PRD-25
- **Objetivo:** Agentes criam suas próprias tools
- **Escopo:** Research como workflow, skills customizadas, autoevolução

---

## 📊 Status Geral

- **Total de PRDs Válidos:** 28
- **Descartados:** 5 (PRD-09, PRD-13, PRD-14, PRD-15, PRD-17, PRD-30)
- **Implementação:** 6 fases bem definidas
- **PRD Prioritário:** PRD-22 (ERP/Fluxo de Caixa) - Fase 5

---

## 🔗 Dependências Críticas

```
PRD-01 (Database)
├── Bloqueador para: TODAS as outras
└── Fundação absoluta

PRD-27 (Secrets)
├── Depende de: PRD-01
└── Fundamental para credenciais

PRD-18 (Chat Internal)
├── Depende de: PRD-01, PRD-27
└── Bloqueador para: PRD-10, PRD-23

PRD-10 (Cron + Heartbeat)
├── Depende de: PRD-01, PRD-18
├── Inclui: Refactoring de notificações
└── Novo: Tabela de notificações (tirar Read/Unread do chat)

PRD-22 (ERP)
├── Depende de: PRD-01
├── Bloqueador para: PRD-06
└── Priorizado para Fase 5
```

---

## 📝 Observações Importantes

1. **PRD-26 (Roles) Adiado:** Muito complexo, deixado para Fase 5
2. **PRD-10 Refactoring:** Inclui criação de tabela de notificações e refactoring de Read/Unread
3. **PRD-23 Esclarecido:** Não é consolidar grupos entre provedores, é ferramentas para gerenciar grupos EM cada provedor
4. **Email Organizacional:** Config de infra (domínio + SMTP/IMAP), não PRD
5. **GitHub:** Config + investigação (GitHub App vs conta por agente)
6. **MinIO + BullMQ:** Serviços compartilhados em aberto, não feature imediata

---

## 📚 Referências Detalhadas

- Veja [PRD_DEPENDENCIES.md](./PRD_DEPENDENCIES.md) para tabela completa de dependências
- Veja [ROADMAP_MAPPING.md](./ROADMAP_MAPPING.md) para mapeamento PRDs → Frentes
- Veja [PRD_REFERENCE.md](./PRD_REFERENCE.md) para lista de todos os 28 PRDs com nomes

---

**Versão:** 2.0 (Consolidada 2026-03-16)
