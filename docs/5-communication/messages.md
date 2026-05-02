# Formato de Mensagens

## CommunicationInboundMessage

Mensagem recebida de um provider.

```typescript
interface CommunicationInboundMessage {
  messageId: string;              // ID único da mensagem
  conversationKey: string;          // Channel ID, email, etc
  conversationName?: string;      // Nome do channel/grupo
  sender: {
    id: string;                    // ID do remetente (user ID, email)
    name: string;                 // Nome do remetente
    role?: 'user' | 'agent' | 'admin' | 'system';
  };
  content: string;                 // Conteúdo da mensagem
  subject?: string;                // Para email
  attachments?: CommunicationFile[];
  timestamp: string;               // ISO 8601
  provider: 'discord' | 'internal-chat' | 'email';
}
```

## CommunicationOutboundMessage

Mensagem para enviar via provider.

```typescript
interface CommunicationOutboundMessage {
  conversationKey: string;          // Destino
  content: string;                  // Conteúdo
  subject?: string;                 // Para email
  mentionUserIds?: string[];        // IDs para mentionar (Discord)
  attachments?: CommunicationFile[];
}
```

## CommunicationOutboundResult

Resultado do envio.

```typescript
interface CommunicationOutboundResult {
  success: boolean;
  messageId?: string;              // ID da mensagem enviada
  timestamp?: string;
  error?: {
    code: string;
    message: string;
  };
}
```

## CommunicationFile

Arquivo anexo.

```typescript
interface CommunicationFile {
  name: string;
  data: Uint8Array;                // Dados do arquivo
  contentType: string;             // MIME type
}
```

## ListMessagesOptions

Opções para listar mensagens.

```typescript
interface ListMessagesOptions {
  since?: number;                   // Timestamp mínimo
  until?: number;                  // Timestamp máximo
  limit?: number;                  // Máximo de mensagens
  conversationKey?: string;         // Filtrar por conversa
  unreadOnly?: boolean;            // Só não lidas
}
```

## Exemplos

### Discord Message

```typescript
{
  messageId: '1234567890123456789',
  conversationKey: '123456789012345678',
  conversationName: 'general',
  sender: {
    id: '987654321098765432',
    name: 'UserName',
    role: 'user'
  },
  content: 'Hello, how can you help me?',
  attachments: [],
  timestamp: '2024-01-15T10:30:00Z',
  provider: 'discord'
}
```

### Email Message

```typescript
{
  messageId: 'abc123def456',
  conversationKey: 'sender@email.com',
  conversationName: 'John Doe',
  sender: {
    id: 'sender@email.com',
    name: 'John Doe',
    role: 'user'
  },
  subject: 'Support Request',
  content: 'I need help with...',
  attachments: [
    {
      name: 'screenshot.png',
      data: Uint8Array([...]),
      contentType: 'image/png'
    }
  ],
  timestamp: '2024-01-15T10:30:00Z',
  provider: 'email'
}
```

### Internal Chat Message

```typescript
{
  messageId: 'msg-uuid',
  conversationKey: 'geral',
  conversationName: 'Geral',
  sender: {
    id: 'agent-orion',
    name: 'Orion',
    role: 'agent'
  },
  content: 'Team meeting at 3pm',
  attachments: [],
  timestamp: '2024-01-15T10:30:00Z',
  provider: 'internal-chat'
}
```

## Conversão entre Providers

```typescript
// Converter para formato interno
function toInternalMessage(
  provider: 'discord' | 'internal-chat' | 'email',
  rawMessage: unknown
): CommunicationInboundMessage {
  switch (provider) {
    case 'discord':
      return {
        messageId: rawMessage.id,
        conversationKey: rawMessage.channelId,
        sender: {
          id: rawMessage.author.id,
          name: rawMessage.author.username,
        },
        content: rawMessage.content,
        timestamp: rawMessage.timestamp,
        provider: 'discord',
      };
    
    case 'email':
      return {
        messageId: rawMessage.messageId,
        conversationKey: rawMessage.from.email,
        sender: {
          id: rawMessage.from.email,
          name: rawMessage.from.name,
        },
        subject: rawMessage.subject,
        content: rawMessage.body,
        timestamp: rawMessage.date,
        provider: 'email',
      };
    
    // ... internal-chat
  }
}
```
