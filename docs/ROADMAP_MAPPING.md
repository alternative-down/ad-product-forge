# Mapeamento: 12 Frentes → PRDs

**Data:** 2026-03-15
**Referência:** VISION.md

---

## Frente 1: Persistência e Configuração Dinâmica de Agentes

**Objetivo:** Migrar de agentes fixa para dinâmica, persistida em banco de dados

**PRDs Relacionados:**
- **PRD-01:** Database-Driven Agent System ✅ (alinhado)
- **PRD-02:** Communication Provider Integration ✅ (alinhado)

**Escopo:**
- SQLite + Drizzle ORM
- Schemas de agentes e providers
- Migrations e versionamento de dados
- Carregamento dinâmico em runtime

---

## Frente 2: Segurança e Gestão de Credenciais

**Objetivo:** Proteger dados sensíveis (tokens, senhas, credenciais)

**PRDs Relacionados:**
- **PRD-01:** Database-Driven Agent System (criptografia) ✅
- **PRD-27:** Secrets Management (vault) ✅ (existe)

**Escopo:**
- Criptografia AES-256-GCM para credenciais
- Vault/secrets management centralizado
- Rotação de credenciais

---

## Frente 3: Papéis, Funções e Governança Organizacional

**Objetivo:** Schema de papéis/funções para RBAC e organização interna

**PRDs Relacionados:**
- **PRD-26:** Role and Function Schema ⚠️ (precisa alinhamento)

**Escopo:**
- Função: agrupador organizacional
- Papel: definição de permissões (Tools, Providers, Workflows)
- Master agent com permissão irrestrita
- Gestão de papéis/funções pelos próprios agentes

---

## Frente 4: Workflows de Contratação, Demissão e Operação

**Objetivo:** Ciclo de vida estruturado de agentes

**PRDs Relacionados:**
- **PRD-03:** Agent Hiring Workflow ✅
- **PRD-04:** Agent Termination Workflow ✅
- **PRD-02:** External Agent System (agentes externos) ✅

**Escopo:**
- Workflow de contratação de novos agentes
- Workflow de demissão/desligamento
- Agentes externos sob demanda (consultores, personas)

---

## Frente 5: Comunicação Interna e Externa

**Objetivo:** Evolução de comunicação para suportar grupos e múltiplos provedores

**PRDs Relacionados:**
- **PRD-18:** Internal Group Chat Implementation (participants) ✅ (reescrito)
- **PRD-23:** Multi-Provider Group Support ⚠️ (precisa alinhamento)
- **PRD-15:** Email Service Integration ❌ (removido)
- **PRD-21:** Marketing Platform Integration ⏸️ (deferred)

**Escopo:**
- Chat interno: suporte a grupos/participants
- Email por agente (SMTP/IMAP)
- Discord: integração com groups
- Ticketing system como provider de comunicação
- Email organizacional com configuração de domínio

---

## Frente 6: Despertadores, Agendamentos e Continuidade

**Objetivo:** Heartbeat e agendamentos para manter agentes ativos

**PRDs Relacionados:**
- **PRD-10:** Cron/Scheduling Tool + Heartbeat System ✅ (complementado)

**Escopo:**
- Heartbeat periódico (padrão 5 min)
- Crons/agendamentos criados por agentes
- Detecção de tarefas pendentes e retomada
- Debounce e wake-up no chat interno

---

## Frente 7: Eventos Externos e Automação Orientada a Gatilhos

**Objetivo:** Receber e rotear eventos externos para agentes

**PRDs Relacionados:**
- **PRD-33:** Webhook Event Routing System ✅ (existe)
- **PRD-05:** Application Deployment (webhook Coolify) ✅
- **PRD-06:** Billing/Payment Integration (webhook Stripe/Asaas) ✅

**Escopo:**
- Webhooks e roteamento interno
- Eventos GitHub (push, PR, issues)
- Eventos Coolify (deploy status)
- Eventos de pagamento (Stripe, Asaas)
- Ads e plataformas de marketing
- Wake-up de agentes em eventos

---

## Frente 8: Desenvolvimento, Deploy e Infraestrutura Base

**Objetivo:** Templates, deploy automatizado e infraestrutura base

**PRDs Relacionados:**
- **PRD-30:** Web Application Templates ✅
- **PRD-05:** Application Deployment (Coolify) ✅
- **PRD-32:** Domain Management ❌ (removido - config)
- **PRD-07:** Browser Service ⚠️ (investigação necessária)
- **PRD-26:** Task Queue & Event Processing (BullMQ) ✅
- **PRD-25:** MinIO Storage (não existe PRD específico)

**Escopo:**
- Templates web com auth, pagamento, tickets
- Deploy via Coolify em Hetzner
- Domínio wildcard e DNS management
- Browser externo (serviço)
- MinIO para storage
- BullMQ/trigger.dev para async
- Configuração de aplicação pós-deploy

---

## Frente 9: Operação de Negócio via ERP/CRM/Financeiro

**Objetivo:** Gestão operacional da empresa digital

**PRDs Relacionados:**
- **PRD-22:** Micro-ERP System ✅
- **PRD-31:** CRM System ❌ (descartado)
- **PRD-24:** Project & Task Management ✅
- **PRD-06:** Billing & Payment Integration ✅
- **PRD-08:** Cash Flow Control ⏸️ (deferred)

**Escopo:**
- Micro ERP: gastos, recebimentos, previsões, folha de pagamento
- CRM integrado
- Projetos/tarefas
- Fluxo de caixa e governança
- Integração Stripe + Asaas
- Acesso de agentes aos dados financeiros

---

## Frente 10: Conhecimento, Memória e Busca Semântica

**Objetivo:** Base de conhecimento compartilhada com busca semântica

**PRDs Relacionados:**
- **PRD-19:** Knowledge Base System ❌ (não alinhado)
- **PRD-29:** Sub-agent Capability ⚠️ (opcional, precisa avaliação)

**Escopo:**
- Workspace do Mastra: embeddings, busca semântica, GraphRAG
- Base de conhecimento no ERP
- Memória de longo prazo de agentes
- Subagentes (LLM mais barato) para tarefas internas

---

## Frente 11: Marketing, Presença Pública e Canais de Divulgação

**Objetivo:** Artefatos de marketing e integração com plataformas públicas

**PRDs Relacionados:**
- **PRD-20:** Marketing Artifact Generation Tools ✅
- **PRD-28:** Social Media & Community Integration ⚠️
- **PRD-21:** Marketing Platform Integration ⏸️

**Escopo:**
- Tools para criação de artefatos (imagens, vídeos, áudio, TTS/STT)
- Nanobanana, Vimeo, ElevenLabs, Whisper
- Integração com redes sociais
- Fóruns e canais públicos
- Presença pública e divulgação
- Plataformas de marketing (campanhas)

---

## Frente 12: Autonomia Progressiva - Criação de Ferramentas

**Objetivo:** Agentes criam suas próprias Tools e integrações

**PRDs Relacionados:**
- **PRD-11:** Custom Tool Framework ⏸️ (deferred)
- **PRD-25:** Research as Workflow ✅ (refatorado)

**Escopo:**
- Tools customizadas por agentes (Skills ou Tools próprias)
- Research: transformar de Tool para Workflow
- Criação de integrações sob demanda
- Evolução autônoma de capacidades

---

## Resumo de Status dos PRDs

### ✅ Alinhados (implementar conforme planejado)
- PRD-01: Database-Driven Agent System
- PRD-02: Communication Provider Integration
- PRD-03: Agent Hiring Workflow
- PRD-04: Agent Termination Workflow
- PRD-05: Application Deployment
- PRD-06: Billing/Payment Integration
- PRD-10: Cron/Scheduling + Heartbeat
- PRD-18: Internal Group Chat (reescrito)
- PRD-20: Marketing Artifact Generation
- PRD-22: Micro-ERP System
- PRD-24: Project & Task Management
- PRD-25: Research as Workflow (refatorado)
- PRD-26: Task Queue & Event Processing
- PRD-27: Secrets Management
- PRD-30: Web Application Templates
- PRD-33: Webhook Event Routing

### ⚠️ Precisa Alinhamento
- PRD-16: GitHub Integration (não é PRD, é config)
- PRD-23: Multi-Provider Group Support (alinhamento com PRD-18)
- PRD-26: Role and Function Schema (detalhar permissões)
- PRD-28: Social Media & Community Integration (detalhar escopo)
- PRD-29: Sub-agent Capability (avaliar viabilidade)

### ⏸️ Adiado para Depois
- PRD-08: Cash Flow Control
- PRD-11: Custom Tool Framework
- PRD-21: Marketing Platform Integration

### ❌ Descartado/Removido
- PRD-09: CRM System (descartado)
- PRD-12: Distributed Storage (misaligned, será MinIO)
- PRD-13: Domain Management (config, não PRD)
- PRD-14: Electronic Signature (descartado)
- PRD-15: Email Service Integration (config)
- PRD-17: Heartbeat System (integrado a PRD-10)
- PRD-19: Knowledge Base (será via Mastra workspace)
- PRD-31: Ticketing System (será integrado como provider em PRD-18)

---

## Observações

1. **PRDs com duplicação ou sobreposição:**
   - PRD-10 (cron+heartbeat) absorveu PRD-17
   - PRD-18 (participants) deve ser base para PRD-23
   - Ticketing será como provider em PRD-18

2. **Configuração vs PRD:**
   - PRD-13 (domínios), PRD-15 (email), PRD-16 (GitHub) são configurações, não features

3. **Investigação necessária:**
   - PRD-07 (Browser): serviço externo como openclaw
   - PRD-29 (Subagents): viabilidade com múltiplos agentes

4. **Priorização sugerida:**
   - P0: PRD-01, 02, 03, 04, 10, 18, 22, 26, 27, 30
   - P1: PRD-05, 06, 20, 24, 25, 33
   - P2: PRD-23, 28
   - P3+: PRD-08, 11, 21, 07, 29
