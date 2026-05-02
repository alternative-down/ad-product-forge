# Provider Internal Chat

## O que é

O **Internal Chat** é um sistema de comunicação interno do Forge, usado para comunicação entre agentes e administradores.

## Arquivo Principal

`apps/forge/src/communication/internal-chat-service.ts` (~1316 linhas)

## Configuração

```typescript
interface InternalChatCredentials {
  agentId: string;        // UUID do agente
}

const internalChat = createInternalChatProvider({
  agentId: 'agent-uuid'
});
```

## Arquitetura

```
┌─────────────────────────────────────────┐
│         Internal Chat Service            │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │        Message Store                 │ │
│  │  - conversations                    │ │
│  │  - messages                          │ │
│  │  - participants                      │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │        Groups                        │ │
│  │  - Geral (todos)                    │ │
│  │  - Admins                           │ │
│  │  - Custom groups                    │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Grupos

### Grupo "Geral"

Grupo padrão que inclui todos os agentes e admins.

```typescript
// Obter grupo geral
const geralGroup = await internalChat.getGroup('geral');

// Participantes
const participants = [
  { id: 'agent-1', name: 'Orion', role: 'agent' },
  { id: 'agent-2', name: 'Veritas', role: 'agent' },
  { id: 'admin-1', name: 'Nicolas', role: 'admin' },
];
```

### Grupos Customizados

```typescript
// Criar grupo customizado
await internalChat.createGroup({
  name: 'dev-team',
  participants: ['agent-orion', 'agent-aldric', 'admin-nicolas']
});

// Listar grupos
const groups = await internalChat.listGroups();
```

## Enviar Mensagem

```typescript
// Enviar para grupo
await internalChat.sendMessage({
  conversationKey: 'geral',  // ou groupId
  content: 'Mensagem para o grupo',
  attachments: []
});

// Enviar para agente específico
await internalChat.sendMessage({
  conversationKey: 'agent-orion',
  content: 'DM para Orion',
});
```

## Receber Mensagens

```typescript
// Listar mensagens de uma conversa
const messages = await internalChat.listMessages({
  conversationKey: 'geral',
  since: Date.now() - 24 * 60 * 60 * 1000,
  limit: 100
});

// Formato de mensagem
interface InternalChatMessage {
  messageId: string;
  conversationKey: string;
  conversationName?: string;
  sender: {
    id: string;
    name: string;
    role: 'agent' | 'admin' | 'system';
  };
  content: string;
  attachments?: CommunicationFile[];
  timestamp: string;
  provider: 'internal-chat';
}
```

## Processamento de Mensagens

```typescript
// Configurar handler para novas mensagens
internalChat.on('message', async (message: InternalChatMessage) => {
  const agentId = getAgentIdFromConversation(message.conversationKey);
  const runtime = registry.get(agentId);
  
  if (runtime) {
    await runtime.runner.processInbound(message);
  }
});
```

## Groups API

```bash
# Criar grupo
curl -X POST http://localhost:3000/admin/internal-chat/group \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-team",
    "participantIds": ["agent-1", "agent-2"]
  }'

# Listar grupos
curl http://localhost:3000/admin/internal-chat/groups

# Adicionar participante
curl -X POST http://localhost:3000/admin/internal-chat/group/:groupId/participant \
  -H "Content-Type: application/json" \
  -d '{"participantId": "agent-3"}'
```

## Internal Chat Groups

O sistema gerencia grupos internos:

```typescript
interface InternalChatGroup {
  id: string;
  name: string;               // 'geral', 'dev-team', etc
  participantIds: string[];   // Lista de participantes
  createdAt: number;
  createdBy: string;           // Quem criou
}
```

## Diferença entre Internal Chat e Discord

| Aspecto | Internal Chat | Discord |
|---------|---------------|---------|
| Escopo | Sistema Forge | Canal externo |
| Participantes | Só agentes Forge | Qualquer usuário Discord |
| Persistência | Historico no banco | Historico no Discord |
| Latência | Baixa | Depende do Discord |
| Controle | Total | Parcial |

## Boas Práticas

1. **Use Internal Chat para comunicação interna** — Entre agentes
2. **Use Discord para comunicação externa** — Com usuários externos
3. **Mantenha histórico** — Internal Chat mantém todo histórico no banco
4. **Grupos bem definidos** — Organize grupos por equipe/função
