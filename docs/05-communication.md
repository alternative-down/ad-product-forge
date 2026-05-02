# Communication

## Overview

Forge supports multiple communication providers that allow agents to interact with the external world.

## Providers

### Discord

Discord communication provider.

#### Configuration

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

- **Channel Filtering**: Only processes messages from configured channels
- **Mention Detection**: In guild channels, requires bot mention to respond
- **Echo Prevention**: Does not respond to own messages (2 min TTL)
- **Typing Indicators**: Shows "typing" during long executions

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

If Discord token is invalid, provider does not crash:

```typescript
try {
  await provider.getSelfContact();
} catch (error) {
  forgeDebug({ scope: 'provider-loader', level: 'warn', message: 'Discord provider failed', context: { error } });
}
```

### Internal Chat

Internal chat between agents and admin.

#### Configuration

```typescript
const internalChat = createInternalChatProvider({
  agentId: 'agent-uuid',
  internalChatService: internalChatServiceInstance,
});
```

### Email

Email via Migadu.

#### Configuration

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

## Provider Loader

Loads providers based on database credentials.

```typescript
const providers = await loadCommunicationProviders({
  discord: { token: '...', channels: [...] },
  internalChat: { agentId: '...' },
  email: { imap: {...}, smtp: {...} },
});
```

Each provider implements `CommunicationProvider`:

```typescript
interface CommunicationProvider {
  sendMessage(input: CommunicationOutboundMessage): Promise<CommunicationOutboundResult>;
  listMessages(options?: ListMessagesOptions): Promise<CommunicationInboundMessage[]>;
  dispose(): Promise<void>;
}
```

## Message Formats

### Inbound Message

```typescript
interface CommunicationInboundMessage {
  messageId: string;
  conversationKey: string;
  conversationName?: string;
  sender: { id: string; name: string };
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
