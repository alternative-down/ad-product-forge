# Comunicação

## Overview

O Forge suporta múltiplos providers de comunicação que permitem aos agentes interagir com o mundo externo.

## Providers

### Discord

Provider para comunicação via Discord.

#### Configuração

```typescript
const discord = createDiscordProvider({
  token: 'DISCORD_BOT_TOKEN',
  channels: [
    { channelId: '123456', respondToMentionsOnly: false },
    { channelId: '789012', respondToMentionsOnly: true },
  ],
});
```

#### Features

- **Channel Filtering**: Só processa mensagens dos canais configurados
- **Mention Detection**: Em canais guild, exige mention do bot para responder
- **Echo Prevention**: Não responde a próprias mensagens (2 min TTL)
- **Typing Indicators**: Mostra "typing" durante execuções longas

#### Message Flow

```
Discord MessageCreate
  → Filter: bot messages? discard
  → Filter: configured channels? discard
  → Filter: mentions (if required)? discard
  → Filter: echo (recent messages)? discard
  → Parse: inbound message
  → AgentRunner.processInbound()
  → Response via sendMessage()
```

#### Graceful Degradation

Se o token Discord for inválido, o provider não crasha:

```typescript
try {
  await provider.getSelfContact();
} catch (error) {
  // Log warning, skip Discord provider
  forgeDebug({
    scope: 'provider-loader',
    level: 'warn',
    message: 'Discord provider failed',
    context: { error },
  });
}
```

### Internal Chat

Provider para chat interno entre agentes e admin.

#### Configuração

```typescript
const internalChat = createInternalChatProvider({
  agentId: 'agent-uuid',
  internalChatService: internalChatServiceInstance,
});
```

#### Features

- Grupo "Geral" configurado
- DM para agentes individuais
- Histórico de conversas
- Notificações de eventos

### Email

Provider para email via Migadu.

#### Configuração

```typescript
const email = createEmailProvider({
  imap: {
    host: 'imap.migadu.com',
    port: 993,
    user: 'agent@example.com',
    password: 'password',
  },
  smtp: {
    host: 'smtp.migadu.com',
    port: 465,
    user: 'agent@example.com',
    password: 'password',
  },
  bcc: ['archive@example.com'],
});
```

#### Operations

```typescript
// Enviar email
await provider.sendMessage({
  to: 'user@example.com',
  subject: 'Assunto',
  body: 'Corpo do email',
  conversationKey: 'thread-id',
});

// Buscar emails (IMAP)
const messages = await provider.listMessages({
  since: Date.now() - 24 * 60 * 60 * 1000,
  limit: 50,
});
```

## Provider Loader

Carrega providers baseado em credenciais do banco.

```typescript
const providers = await loadCommunicationProviders({
  discord: { token: '...', channels: [...] },
  internalChat: { agentId: '...' },
  email: { imap: {...}, smtp: {...} },
});
```

Cada provider é uma implementação de `CommunicationProvider`:

```typescript
interface CommunicationProvider {
  sendMessage(input: CommunicationOutboundMessage): Promise<CommunicationOutboundResult>;
  listMessages(options?: ListMessagesOptions): Promise<CommunicationInboundMessage[]>;
  dispose(): Promise<void>;
}
```

## Conversação

### Inbound Message

```typescript
interface CommunicationInboundMessage {
  messageId: string;
  conversationKey: string;
  conversationName?: string;
  sender: {
    id: string;
    name: string;
  };
  content: string;
  attachments?: CommunicationFile[];
  timestamp: string;
  provider: 'discord' | 'internal-chat' | 'email';
}
```

### Outbound Message

```typescript
interface CommunicationOutboundMessage {
  conversationKey: string;
  content: string;
  attachments?: CommunicationFile[];
  mentionUserIds?: string[];
}
```

### Communication File

```typescript
interface CommunicationFile {
  name: string;
  data: Uint8Array;
  contentType?: string;
  sizeBytes: number;
}
```
