# PRD-31: Sistema de Tickets como Provider de Comunicação

> Status: planned. This document does not describe implemented behavior unless explicitly stated.

**Status:** Planejamento

**Data:** 2026-03-15

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Integrar ticketing como provider de comunicação** que permite aos agentes receber, responder e gerenciar tickets abertos nos sistemas criados por eles (via templates web).

Tickets são tratados como canal de comunicação, integrado com outros providers (chat interno, Discord, email).

**Objetivo:** Permitir que agentes prestem suporte aos usuários de suas aplicações através de um sistema de tickets integrado à plataforma.

---

## Problema

- Templates web incluem sistema de tickets
- Precisa integração entre app criada e plataforma de execução dos agentes
- Agentes precisam receber e responder tickets como parte de suas operações
- Tickets devem ser tratados como canal de comunicação

---

## Solução

Implementar ticketing como **provider de comunicação** (como Discord, email):

1. **Receber tickets** das aplicações criadas pelos agentes
2. **Armazenar tickets** no sistema centralizado
3. **Notificar agentes** quando novo ticket chega
4. **Permitir resposta** via interface de agente
5. **Integrar com chat interno** como mais um provider

---

## Integração entre App Template e Plataforma

**Fluxo:**
1. Usuário abre ticket em app criada pelo agente
2. Ticket é enviado para platform (via API)
3. Platform recebe e armazena
4. Agente é notificado (como mensagem no chat interno)
5. Agente responde
6. Resposta retorna para usuário na app

---

## Schema do Banco de Dados

**Tabela: `tickets`**
```
- ticket_id (UUID, primary key)
- app_id (UUID) - qual aplicação gerou o ticket
- agent_id (UUID) - qual agente deve responder
- user_id (string) - quem abriu o ticket
- title (TEXT)
- description (TEXT)
- status (ENUM: open, in_progress, resolved, closed)
- priority (ENUM: low, medium, high)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- resolved_at (TIMESTAMP, nullable)
```

**Tabela: `ticket_messages`**
```
- message_id (UUID)
- ticket_id (UUID)
- sender_id (string) - agente ou usuário
- sender_type (ENUM: agent, user)
- message (TEXT)
- created_at (TIMESTAMP)
```

---

## Como Provider de Comunicação

Tickets funcionam como provider integrado ao PRD-18 (comunicação interna):

- Novo ticket = nova mensagem no chat interno do agente
- Resposta de agente = atualiza ticket na app
- Histórico de ticket = histórico de mensagens

---

## Critérios de Sucesso

- [ ] Tickets criados em apps chegam à plataforma
- [ ] Agentes recebem notificação de novo ticket
- [ ] Agentes conseguem responder tickets
- [ ] Respostas retornam para usuário na app
- [ ] Histórico mantido
- [ ] Integração com chat interno funciona

---

## Dependências

- PRD-18: Internal Group Chat (como provider)
- PRD-30: Web Application Templates (tickets inclusos)
- PRD-05: Application Deployment (apps comunicam com plataforma)

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Ticketing como provider de comunicação integrado ao PRD-18
