# PRD-33: Sistema de Roteamento de Evento & Webhook

**Status:** Planejamento

**Boundary note:** GitHub e Coolify podem usar endpoints adapter-specific próprios e não precisam passar por este PRD na primeira versão. Este PRD continua reservado para um bus genérico de webhook quando isso realmente fizer sentido.

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de integração específica do ad-product-forge.** Roteamento de webhook permite que agentes de Nicolas respondam a eventos de sistema externo (pushes GitHub, notificações de pagamento, conclusões de deployment, etc.). Enquanto padrões de webhook sejam gerais, esta implementação específica é específica da aplicação.

Endpoint simples de webhook para sistemas externos dispararem ações de agente. Agentes recebem eventos de webhook via mensagens internas.

**Comportamento Core:** HTTP POST → validar assinatura → enfileirar evento → acordar agente → agente processa evento.

**Casos de Uso de Aplicação:**
- Webhooks GitHub disparam agentes de desenvolvimento
- Webhooks de sistema de pagamento disparam agentes de billing
- Webhooks de deployment podem notificar agentes de operações quando não houver adapter-specific endpoint próprio
- Webhooks de plataforma de ad alimentam sinais para agentes de pesquisa

---

## Conceitos Core

### 1. Rota de Webhook

Um endpoint HTTP que recebe eventos de sistemas externos.

```typescript
{
  routeId: string;              // UUID
  agentId: string;              // Agente que possui esta rota
  pathPattern: string;          // Caminho URL (ex: "/webhook/my-route")
  secret?: string;              // Segredo HMAC para verificação de assinatura
  isActive: boolean;            // Aceitar eventos?
  createdAt: string;
}
```

### 2. Evento de Webhook

Payload HTTP bruto recebido de sistema externo.

```typescript
{
  eventId: string;              // UUID
  routeId: string;              // Qual rota recebeu isto
  agentId: string;              // Agente que possui a rota
  payload: Record<string, unknown>;  // Payload JSON bruto
  receivedAt: string;           // Quando recebido
  isProcessed: boolean;         // Agente processou?
}
```

### 3. Armazenamento de Evento

Eventos armazenados por agente, fila em memória simples.

```typescript
{
  eventId: string;
  routeId: string;
  agentId: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  isProcessed: boolean;
}
```

### 4. Roteamento de Evento

Fluxo simples:
1. HTTP POST para `/webhook/{routeId}`
2. Verificar assinatura se segredo configurado
3. Criar registro de evento
4. Enfileirar evento → acordar agente
5. Retornar 202 Accepted imediatamente
6. Agente processa depois

---

## Implementação

### Servidor HTTP

Servidor HTTP simples que aceita requisições POST:
- Porta: 3001 (configurável via var env)
- Caminho base: `/webhook`
- Endpoint: `POST /webhook/{routeId}`

### Códigos de Resposta

- `202 Accepted` — Evento recebido
- `400 Bad Request` — Payload inválido
- `401 Unauthorized` — Verificação de assinatura falhada
- `404 Not Found` — Rota não existe

---

## Ferramentas de Agente

Ferramentas simples para agentes trabalharem com webhooks:

```typescript
// Criar uma rota de webhook
createWebhookRoute(input: {
  name: string;
}): Promise<{
  routeId: string;
  webhookUrl: string;
  secret: string;
}>

// Listar eventos de webhook para este agente
listQueuedEvents(): Promise<Array<{
  eventId: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}>>

// Marcar evento como processado
processWebhookEvent(eventId: string): Promise<{ success: boolean }>

// Deletar uma rota de webhook
deleteWebhookRoute(routeId: string): Promise<{ success: boolean }>
```

---

## Armazenamento

2 tabelas simples:

- `webhook_routes` — route_id, agent_id, path_pattern, secret
- `webhook_events` — event_id, route_id, agent_id, payload, received_at, is_processed

---

## Timeline

- **Semana 1**: Servidor HTTP + armazenamento de rota/evento + ferramentas de agente
- **Semana 2**: Integração de wake + testes

---

**Fim do documento**
