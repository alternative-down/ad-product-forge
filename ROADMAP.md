# Roadmap - ad-product-forge

**Última Atualização:** 2026-03-15
**Referência:** VISION.md, ROADMAP_MAPPING.md

---

## Objetivo Geral

Estruturar uma plataforma em que agentes possam operar como uma empresa digital: serem criados e geridos dinamicamente, executar tarefas, interagir entre si e com sistemas externos, desenvolver produtos, operar canais de comunicação, controlar recursos da operação e evoluir com autonomia controlada.

---

## 12 Frentes de Desenvolvimento

### Frente 1: Persistência e Configuração Dinâmica de Agentes

**Objetivo:** Migrar de agentes fixa em código para dinâmica, persistida em banco de dados e carregada em runtime.

**PRDs:**
- PRD-01: Database-Driven Agent System
- PRD-02: Communication Provider Integration

**Escopo:**
- SQLite + Drizzle ORM
- Schemas de agentes e providers de comunicação
- Migrations e versionamento de dados
- Carregamento dinâmico em runtime
- Refatoração de módulos SMTP/IMAP para Drizzle

**Status:** 📋 Planejamento

---

### Frente 2: Segurança e Gestão de Credenciais

**Objetivo:** Proteger dados sensíveis (tokens, senhas, credenciais de provedores)

**PRDs:**
- PRD-01: Database-Driven Agent System (criptografia AES-256-GCM)
- PRD-27: Secrets Management

**Escopo:**
- Criptografia de credenciais em repouso
- Vault/secrets centralizado para agentes
- Rotação de credenciais
- Acesso seguro aos dados sensíveis

**Status:** 📋 Planejamento

---

### Frente 3: Papéis, Funções e Governança Organizacional

**Objetivo:** Schema de papéis e funções para controle de acesso e organização interna

**PRDs:**
- PRD-26: Role and Function Schema

**Conceitos:**
- **Função:** agrupador organizacional ao qual o agente está vinculado
- **Papel:** definição efetiva de permissões (Tools, Providers, Workflows)

**Escopo:**
- Master agent com permissão irrestrita
- Agentes podem criar/alterar papéis e funções
- Controle de acesso granular por papel
- Trilha de auditoria de mudanças

**Status:** 📋 Planejamento

---

### Frente 4: Workflows de Contratação, Demissão e Operação

**Objetivo:** Ciclo de vida estruturado de agentes

**PRDs:**
- PRD-03: Agent Hiring Workflow
- PRD-04: Agent Termination Workflow
- PRD-02: External Agent System

**Escopo:**
- Workflow de contratação com definição de account, providers, permissões
- Workflow de demissão com limpeza de recursos
- Agentes externos sob demanda (consultores, personas)
- Agentes externos com permissões restritas (apenas mensagens)

**Status:** 📋 Planejamento

---

### Frente 5: Comunicação Interna e Externa

**Objetivo:** Evolução de comunicação para suportar grupos, múltiplos provedores e canais de suporte

**PRDs:**
- PRD-18: Internal Group Chat Implementation (suporte a participants/grupos)
- PRD-23: Multi-Provider Group Support (Discord, Email)
- Ticketing system (como provider de comunicação)

**Escopo:**
- Chat interno com suporte a grupos/channels
- Email por agente com configuração de domínio
- Discord: integração com criação de canals
- Ticketing como provider (receber tickets, atender usuários)
- Configuração de email organizacional (SMTP/IMAP)

**Status:** 📋 Planejamento

---

### Frente 6: Despertadores, Agendamentos e Continuidade

**Objetivo:** Heartbeat e agendamentos para manter agentes ativos e permitting execução contínua

**PRDs:**
- PRD-10: Cron/Scheduling Tool + Heartbeat System

**Escopo:**
- Heartbeat periódico (padrão 5 min) por agente
- Tools para criação de crons/agendamentos pelos agentes
- Detecção de tarefas pendentes e retomada
- Debounce de wake-ups
- Integração com chat interno para messaging de eventos agendados

**Status:** ✅ Alinhado

---

### Frente 7: Eventos Externos e Automação Orientada a Gatilhos

**Objetivo:** Receber eventos externos e rotear para agentes corretos, com wake-up

**PRDs:**
- PRD-33: Webhook Event Routing System
- PRD-05: Application Deployment (webhook Coolify)
- PRD-06: Billing/Payment Integration (webhooks Stripe/Asaas)

**Escopo:**
- Webhooks para eventos externos
- Roteamento de eventos para agentes
- Eventos GitHub (push, PR, issues)
- Eventos Coolify (deploy status)
- Eventos de pagamento (Stripe, Asaas)
- Ads e plataformas de marketing
- Wake-up de agentes em eventos

**Status:** 📋 Planejamento

---

### Frente 8: Desenvolvimento, Deploy e Infraestrutura Base

**Objetivo:** Templates, deploy automatizado e infraestrutura necessária para aplicações

**PRDs:**
- PRD-30: Web Application Templates
- PRD-05: Application Deployment (Coolify)
- PRD-07: Browser Service (investigação necessária)
- PRD-26: Task Queue & Event Processing (BullMQ/trigger.dev)
- Storage: MinIO (não existe PRD específico)

**Escopo:**
- Templates web com auth, gateway de pagamento, integração com tickets
- Deploy automatizado via Coolify em Hetzner
- Domínio wildcard e DNS management
- Browser como serviço externo (openclaw-like)
- MinIO para storage (decidir se único ou por app)
- BullMQ/trigger.dev para execução assíncrona

**Status:** 📋 Planejamento

---

### Frente 9: Operação de Negócio via ERP/CRM/Financeiro

**Objetivo:** Gestão operacional da empresa digital

**PRDs:**
- PRD-22: Micro-ERP System
- PRD-24: Project & Task Management
- PRD-06: Billing & Payment Integration
- PRD-08: Cash Flow Control (deferred)

**Escopo:**
- Micro ERP: registrar gastos, recebimentos, previsões, folha de pagamento
- CRM integrado
- Projetos/tarefas
- Fluxo de caixa e governança (limitar ações, priorizar)
- Integração Stripe + Asaas
- Acesso de agentes aos dados financeiros

**Status:** 📋 Planejamento (PRD-08 deferred)

---

### Frente 10: Conhecimento, Memória e Busca Semântica

**Objetivo:** Base de conhecimento compartilhada com busca semântica

**Escopo:**
- Workspace do Mastra: embeddings, busca semântica, GraphRAG
- Base de conhecimento no ERP
- Memória de longo prazo de agentes
- Subagentes com LLM mais barato (opcional, precisa avaliação)

**Status:** 🔍 Investigação

---

### Frente 11: Marketing, Presença Pública e Canais de Divulgação

**Objetivo:** Artefatos de marketing e integração com plataformas públicas

**PRDs:**
- PRD-20: Marketing Artifact Generation Tools
- PRD-28: Social Media & Community Integration
- PRD-21: Marketing Platform Integration (deferred)

**Escopo:**
- Tools para criação de artefatos (imagens, vídeos, áudio)
- TTS/STT (ElevenLabs, OpenAI Whisper, etc)
- Nanobanana para geração de imagens
- Integração com redes sociais
- Fóruns e canais públicos
- Plataformas de marketing (campanhas)

**Status:** 📋 Planejamento

---

### Frente 12: Autonomia Progressiva - Criação de Ferramentas

**Objetivo:** Agentes criam suas próprias tools e integrações

**PRDs:**
- PRD-11: Custom Tool Framework (deferred)
- PRD-25: Research as Workflow

**Escopo:**
- Tools customizadas por agentes (via Skills ou framework próprio)
- Research: transformar de Tool para Workflow
- Criação de integrações sob demanda
- Evolução autônoma de capacidades

**Status:** 📋 Planejamento (PRD-11 deferred)

---

## Integração e Dependências

### Fundamentações que habilitam múltiplas frentes:
- **Frente 1+2:** Base para toda comunicação, autenticação e acesso a dados
- **Frente 3:** Habilitador para controle em Frentes 4-12
- **Frente 6:** Habilitador para continuidade em Frentes 5, 7, 9

### Sequência recomendada:

**Fase 1 (Fundação):** Frentes 1, 2, 3
**Fase 2 (Operação Básica):** Frentes 4, 6, 9
**Fase 3 (Extensão):** Frentes 5, 7, 8
**Fase 4 (Especialização):** Frentes 10, 11, 12

---

## Status Geral

- **Alinhadas:** 16 PRDs
- **Precisam Alinhamento:** 5 PRDs
- **Adiadas para Depois:** 3 PRDs
- **Descartadas:** 9 PRDs

**Total Ativo:** 21 PRDs mapeados às 12 Frentes

---

## Referências

- VISION.md: Anotações originais da plataforma
- ROADMAP_MAPPING.md: Mapeamento detalhado de PRDs às frentes
- docs/planning/: PRDs individuais
