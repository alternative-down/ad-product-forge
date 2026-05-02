# Provider Discord

## Configuração

### Credenciais

```typescript
interface DiscordCredentials {
  token: string;              // Bot token do Discord Developer Portal
  channels: Array<{
    channelId: string;        // ID do canal
    respondToMentionsOnly: boolean;  // Requer menção do bot?
  }>;
}
```

### Obter Bot Token

1. Vá para https://discord.com/developers
2. Crie ou selecione uma aplicação
3. Vá para "Bot" no menu lateral
4. Clique "Reset Token" para obter o token
5. **Importante**: Guarde o token em local seguro

### Habilitar Message Content Intent

1. Vá para "Bot" nas settings da aplicação
2. Vá para "Privileged Gateway Intents"
3. Habilite "Message Content Intent"

Sem isso, o bot não consegue ler o conteúdo das mensagens.

## Configurar Channels

```typescript
// Criar provider
const discord = createDiscordProvider({
  token: 'Bot xxx',
  channels: [
    {
      channelId: '123456789',
      respondToMentionsOnly: false  // Responde a todas mensagens
    },
    {
      channelId: '987654321',
      respondToMentionsOnly: true   // Só responde se mencionar o bot
    }
  ]
});
```

## Filtros de Mensagens

### Channel Filter

O provider só processa mensagens de channels configurados.

```typescript
// Se channel não está na lista, mensagem é ignorada
const isAllowedChannel = channels.some(c => c.channelId === message.channelId);
```

### Mention Filter

Em guild channels, o bot pode requerer menção para responder.

```typescript
// Se respondToMentionsOnly = true
// Mensagem sem menção do bot é ignorada
const mentionsBot = message.content.includes('<@' + botUserId + '>');
```

### Echo Prevention

O provider não responde às próprias mensagens.

```typescript
// TTL de 2 minutos
const isOwnMessage = message.author.id === botUserId;
const isRecent = Date.now() - message.timestamp < 2 * 60 * 1000;
const isEcho = isOwnMessage && isRecent;
```

## Enviar Mensagem

```typescript
// Enviar para channel
await discord.sendMessage({
  conversationKey: '123456789',  // channel ID
  content: 'Olá! Como posso ajudar?',
  attachments: [
    {
      name: 'file.txt',
      data: new Uint8Array([...]),
      contentType: 'text/plain'
    }
  ]
});

// Enviar DM
await discord.sendMessage({
  conversationKey: 'user-123',  // user ID para DM
  content: 'Mensagem privada',
  mentionUserIds: ['user-456']
});
```

## Receber Mensagens

```typescript
// Listar mensagens recentes (opcional)
const messages = await discord.listMessages({
  since: Date.now() - 60 * 60 * 1000,  // últimas 1 hora
  limit: 50,
  conversationKey: '123456789'
});

// Processar mensagem
interface CommunicationInboundMessage {
  messageId: string;
  conversationKey: string;        // channel ID
  conversationName?: string;       // nome do channel
  sender: {
    id: string;                    // user ID
    name: string;                 // username
  };
  content: string;
  attachments?: CommunicationFile[];
  timestamp: string;
  provider: 'discord';
}
```

## Typing Indicator

O provider mostra "typing" durante execuções longas.

```typescript
// Automaticamente
await provider.sendTypingIndicator(conversationKey);
```

## Health Check

```typescript
// Verificar conexão
const healthy = await discord.healthcheck?.();

if (!healthy) {
  forgeDebug({
    scope: 'provider-loader',
    level: 'warn',
    message: 'Discord provider unhealthy',
    context: { agentId }
  });
}
```

## Error Handling

### Token Inválido

```typescript
try {
  await discord.sendMessage({...});
} catch (error) {
  if (error.code === 'INVALID_TOKEN') {
    forgeDebug({
      scope: 'discord-provider',
      level: 'error',
      message: 'Invalid Discord token',
      context: { error }
    });
  }
}
```

### Rate Limiting

O Discord tem rate limits. O provider implementa backoff automático.

```typescript
// 50 requests/segundo global
// 10 requests/segundo por guild

// Se rate limitado
await sleep(1000);  // backoff
retry();
```

## Rate Limits

| Tipo | Limite | Notas |
|------|--------|-------|
| Global | 50 req/s | Por bot |
| Per Guild | 10 req/s | Por guild |
| Per Channel | 5 req/s | Por channel |
| Create Message | 2 req/s | Por channel |

## Adicionar Provider via API

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "discord",
    "credentials": {
      "token": "Bot xxx",
      "channels": [
        { "channelId": "123456789", "respondToMentionsOnly": false }
      ]
    }
  }'
```

## Atualizar Provider

```bash
curl -X PUT http://localhost:3000/admin/agent-provider \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "discord",
    "credentials": {
      "token": "Novo Token",
      "channels": [...]
    }
  }'
```

## Remover Provider

```bash
curl -X DELETE http://localhost:3000/admin/agent-provider \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "discord"
  }'
```

## Boas Práticas

1. **Guarde o token com segurança** — Não commit no código
2. **Use menções quando necessário** — Reduz ruído
3. **Configure channels específicos** — Não responda em todos
4. **Monitore rate limits** — Evite hitting limits
5. **Valide credenciais** — Teste antes de usar em produção
