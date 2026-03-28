# Cross-Instance Fan-Out

## O que é?

Fan-out permite que mensagens em grupos sejam entregues a participantes em múltiplas instâncias do Ad Product Forge. Quando um agente em uma instância envia uma mensagem para um grupo, ela é propagada para participantes de outras instâncias.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│              CROSS-INSTANCE MESSAGE PROPAGATION                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                           │
│  │  INSTÂNCIA A     │                                           │
│  │  (principal)     │                                           │
│  │                  │                                           │
│  │  ┌────────────┐  │                                           │
│  │  │  Agente    │  │                                           │
│  │  │  Envia    │  │                                           │
│  │  │  mensagem │  │                                           │
│  │  └─────┬──────┘  │                                           │
│  │        │         │                                           │
│  │        ▼         │                                           │
│  │  ┌────────────┐  │                                           │
│  │  │ FanOut     │──┼── HTTP POST ─────────────────────────┐   │
│  │  │ Client     │  │                                      │   │
│  │  └────────────┘  │                                      │   │
│  └──────────────────┘                                      │   │
│                                                              │   │
│                              ┌──────────────────────────────▼┐ │
│                              │  INSTÂNCIA B                 │ │
│                              │                              │ │
│                              │  POST /api/internal/         │ │
│                              │       propagate-message       │ │
│                              │                              │ │
│                              │  Busca participantes         │ │
│                              │  com instanceId === null     │ │
│                              │                              │ │
│                              │  Entrega mensagens           │ │
│                              │  localmente                  │ │
│                              └──────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Tabela de Instâncias

```sql
CREATE TABLE mastra_instances (
  instance_id VARCHAR(255) PRIMARY KEY,
  base_url VARCHAR(255),
  is_healthy BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `instanceId` | string | ID único da instância |
| `baseUrl` | string | URL base para comunicação |
| `isHealthy` | boolean | Se está sehatual |

## Payload da Mensagem

```typescript
interface PropagateMessagePayload {
  conversationId: string;    // ID da conversa/grupo
  content: string;           // Conteúdo da mensagem
  senderId: string;         // ID do remetente
  senderName: string;        // Nome do remetente
  timestamp: string;        // ISO timestamp
  metadata?: Record<string, unknown>;  // Dados adicionais
}
```

## Fluxo de Propagação

```
1. ORIGEM (Instância A)
   └── Agente envia mensagem para grupo
   └── Sistema identifica participantes em outras instâncias
   └── FanOutClient.createPropagateMessageFn() envia HTTP POST

2. DESTINO (Instância B)
   └── Recebe POST em /api/internal/propagate-message
   └── Busca participantes com instanceId === null (locais)
   └── deliverMessageToParticipant() entrega mensagem
   └── Retorna relatório de entrega

3. RESULTADO
   └── { success, delivered, failed, errors[] }
```

## Rotas Internas

### POST /api/internal/propagate-message

Recebe mensagens de outras instâncias e entrega a participantes locais.

**Request:**
```json
{
  "instanceId": "instancia-origem",
  "message": {
    "conversationId": "grupo-123",
    "content": "Olá grupo!",
    "senderId": "agente-456",
    "senderName": "Agente RH",
    "timestamp": "2026-03-28T14:00:00Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "delivered": 3,
  "failed": 0,
  "errors": []
}
```

### GET /api/internal/instances

Retorna lista de instâncias registradas.

**Response:**
```json
{
  "instanceId": "instancia-atual",
  "instances": [
    { "id": "inst-1", "url": "https://forge-1.exemplo.com", "isHealthy": true },
    { "id": "inst-2", "url": "https://forge-2.exemplo.com", "isHealthy": true }
  ]
}
```

## Configuração

### Variáveis de Ambiente

```bash
# ID único da instância
FORGE_INSTANCE_ID=forge-production-1

# URL base (opcional, detecta automaticamente)
FORGE_BASE_URL=https://forge-1.exemplo.com
```

### Registro de Instância

A instância precisa estar registrada na tabela `mastra_instances` com `baseUrl` configurado para que outras instâncias possam enviar mensagens.

## Funções Auxiliares

### createPropagateMessageFn

Cria função para propagar mensagens para instâncias remotas:

```typescript
import { createPropagateMessageFn } from './fanout/client';

const propagateMessage = createPropagateMessageFn(db, localInstanceId);

// Usar:
const result = await propagateMessage('instancia-remota', {
  conversationId: 'grupo-123',
  content: 'Mensagem do grupo',
  senderId: 'agente-456',
  senderName: 'Agente RH',
  timestamp: new Date().toISOString()
});
```

### registerFanOutRoutes

Registra rotas internas para receber mensagens:

```typescript
import { registerFanOutRoutes } from './fanout/routes';

registerFanOutRoutes(registerRoute, {
  getInstances: () => db.query.mastraInstances.findMany(),
  getParticipantsForConversation: (convId) => getGroupParticipants(convId),
  deliverMessageToParticipant: deliverToParticipant
});
```

## Estados de Participante

| `instanceId` | Significado |
|--------------|--------------|
| `null` | Participante local (mesma instância) |
| `"inst-1"` | Participante na instância inst-1 |
| `"local"` | Não propagar (é a instância de origem) |

## Tratamento de Erros

| Erro | Causa | Solução |
|------|-------|---------|
| `Instance not found` | Instância não registrada | Adicionar à tabela `mastra_instances` |
| `Instance has no baseUrl` | URL não configurada | Definir `baseUrl` na tabela |
| `HTTP 500` | Erro interno | Verificar logs da instância destino |

## Fase 2 (Pendente)

- UI para registrar/editar instâncias
- Badges de participantes de outras instâncias
- Retry com dead letter queue
- Autenticação com shared secret
- Observabilidade (métricas de fan-out)
