# Mapeamento: 12 Frentes → PRDs

**Data:** 2026-03-15
**Referência:** VISION.md

---

## Frente 1: Persistência e Configuração Dinâmica de Agentes

**Objetivo:** Migrar de agentes fixa para dinâmica, persistida em banco de dados

**PRDs Relacionados:**
- **PRD-01:** Database-Driven Agent System ✅

**Escopo:**
- SQLite + Drizzle ORM
- Schemas de agentes e providers
- Migrations e versionamento de dados
- Carregamento dinâmico em runtime
- Persistência de configurações de providers de comunicação

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
- **PRD-31:** Ticketing System as Provider ✅

**Escopo:**
- Chat interno: suporte a grupos/participants
- Discord: integração com groups
- Email: múltiplos destinatários e CC
- Ticketing system como provider de comunicação
- **Nota:** Email organizacional por agente é configuração de infra (domínio, SMTP/IMAP), não PRD

---

## Frente 6: Despertadores, Agendamentos e Continuidade

**Objetivo:** Heartbeat e agendamentos para manter agentes ativos

**PRDs Relacionados:**
- **PRD-10:** Cron/Scheduling Tool + Heartbeat System ✅ (complementado)

**Escopo:**
- Heartbeat periódico (intervalo a definir na implementação)
- Crons/agendamentos criados por agentes (node-schedule + database)
- Detecção de tarefas pendentes e retomada
- Debounce e wake-up no chat interno
- Mensagem de cron inserida no provider chat interno (notificação/evento wakeQueue)

---

## Frente 7: Eventos Externos e Automação Orientada a Gatilhos

**Objetivo:** Receber e rotear eventos externos para agentes

**PRDs Relacionados:**
- **PRD-33:** Webhook Event Routing System ✅ (existe)
- **PRD-05:** Application Deployment (webhook Coolify) ✅
- **PRD-06:** Billing/Payment Integration (webhook Stripe/Asaas) ✅

**Escopo:**
- Webhooks e roteamento interno
- Eventos GitHub (push, PR, issues) - **investigação necessária: GitHub App vs account por agente**
- Eventos Coolify (deploy status, erros) - **integrado com sistema de notificações**
- Eventos de pagamento (Stripe, Asaas)
- Ads e plataformas de marketing
- Wake-up de agentes em eventos
- **Questão aberta:** Sistema de notificações para agentes (não existe ainda)

---

## Frente 8: Desenvolvimento, Deploy e Infraestrutura Base

**Objetivo:** Templates, deploy automatizado e infraestrutura base

**PRDs Relacionados:**
- **PRD-32:** Web Application Templates ✅
- **PRD-05:** Application Deployment (Coolify) ✅
- **PRD-07:** Browser Service ⚠️ (investigação necessária)
- **PRD-12:** Serviços de Infraestrutura Compartilhada (MinIO + BullMQ) ⏸️ (em aberto)

**Escopo:**
- Templates web com auth, pagamento, tickets
- Deploy via Coolify em Hetzner
- Domínio wildcard e DNS management (configuração)
- Browser externo (serviço) - investigação necessária
- **Serviços compartilhados em aberto:**
  - MinIO para storage (agentes usam em suas aplicações)
  - BullMQ/trigger.dev para async (agentes usam em suas aplicações)
- Configuração de aplicação pós-deploy

---

## Frente 9: Operação de Negócio - Fluxo de Caixa e ERP

**Objetivo:** Gestão operacional da empresa digital com responsabilidade e accountability dos agentes

**PRDs Relacionados:**
- **PRD-22:** Micro-ERP System ✅ (integrado com fluxo de caixa)
- **PRD-24:** Project & Task Management ✅
- **PRD-06:** Billing & Payment Integration ✅
- **PRD-08:** Cash Flow Control (parte de PRD-22) ⏸️

**Escopo:**
- **Caixa da empresa:** controle centralizado de recursos
  - Custos de contratação de agentes
  - Custos operacionais diários (quanto custa rodar cada agente)
  - Custos de APIs e serviços externos
  - Custos base de infraestrutura
  - Recebimentos
  - Previsões/futuros
- Contas a pagar e receber com histórico
- **Agentes** podem criar views customizadas dos dados
- **Agentes** podem rodar queries diretas para coletar informações
- Folha de pagamento (custo de cada agente em $)
- Integração Stripe + Asaas para recebimentos
- **Dinâmica:** Você faz aportes iniciais → agentes gerenciam dentro do saldo → com tração ficam por conta própria → você faz saques
- **Impacto:** Mecanismo que traz controle e accountability aos agentes
- **Nota:** CRM descartado (agentes usam seus próprios apps)
- **Nota:** Projetos/tarefas deve usar ferramenta existente com MCP pronto ou CLIs (não desenvolver do zero)

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
- **Tools para criação de artefatos** (imagens, vídeos, áudio, TTS/STT)
  - Nanobanana, Vimeo, ElevenLabs, Whisper
- **Social media scheduling:** Buffer como ponto de partida, depois explorar outras ferramentas
- Integração com redes sociais - **investigação necessária**
- Fóruns e canais públicos - **investigação necessária**
- Presença pública e divulgação
- **Marketing pago/publicidade:** Em aberto (você não tem experiência, precisa investigar)

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
- PRD-02: External Agent System
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
- PRD-26: Role and Function Schema
- PRD-27: Secrets Management
- PRD-31: Ticketing System as Provider
- PRD-32: Web Application Templates
- PRD-33: Webhook Event Routing

### ⚠️ Precisa Alinhamento
- PRD-16: GitHub Integration (config + investigação necessária)
- PRD-23: Multi-Provider Group Support (alinhamento com PRD-18)
- PRD-26: Role and Function Schema (detalhar permissões)
- PRD-28: Social Media & Community Integration (detalhar escopo)
- PRD-29: Sub-agent Capability (avaliar viabilidade)

### ⏸️ Adiado para Depois
- PRD-08: Cash Flow Control
- PRD-11: Custom Tool Framework
- PRD-21: Marketing Platform Integration

### ⏸️ Em Aberto / Investigação
- PRD-12: MinIO Storage (em aberto, esperar necessidade surgir)

### ❌ Descartado/Removido
- PRD-09: CRM System (descartado)
- PRD-13: Domain Management (config, não PRD)
- PRD-14: Electronic Signature (descartado)
- PRD-15: Email Service Integration (config)
- PRD-17: Heartbeat System (integrado a PRD-10)
- PRD-19: Knowledge Base (será via Mastra workspace) - **alinhado**
- PRD-31: Ticketing System (será integrado como provider em PRD-18/23) - **alinhado**

---

## Observações

1. **PRDs com duplicação ou sobreposição:**
   - PRD-10 (cron+heartbeat) absorveu PRD-17
   - PRD-18 (participants) deve ser base para PRD-23
   - PRD-31 (ticketing) será como provider em PRD-18/23

2. **Configuração vs PRD:**
   - Email organizacional por agente: configuração (domínio + SMTP/IMAP)
   - Domínio wildcard: configuração (você configura)
   - GitHub access: configuração (GitHub App ou criar account por agente)

3. **Questões em aberto / Investigação necessária:**
   - **GitHub:** Como lidar com agentes sem user real? GitHub App vs account por agente?
   - **Notificações:** Sistema ainda não existe. GitHub + Coolify webhooks precisam de notificações
   - **Browser (PRD-07):** Serviço externo como openclaw
   - **Subagents (PRD-29):** Viabilidade com múltiplos agentes
   - **Redes sociais:** Integração, como começar
   - **Fóruns:** Como integrar
   - **Marketing pago:** Sem experiência, precisa investigar
   - **MinIO:** Em aberto, esperar necessidade surgir

4. **Decisões fechadas:**
   - CRM: Descartado (agentes usam seus próprios apps)
   - Assinatura eletrônica: Descartada
   - Projetos/tarefas: Usar ferramenta existente com MCP/CLI (não desenvolver)

5. **Priorização sugerida:**
   - P0: PRD-01, 02, 03, 04, 10, 18, 22, 26, 27, 30
   - P1: PRD-05, 06, 20, 24, 25, 31, 33
   - P2: PRD-23, 28
   - P3+: PRD-08, 11, 21, 07, 29
