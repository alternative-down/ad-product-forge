# Visão Geral da Comunicação

## Conceito

O Forge suporta múltiplos **providers** de comunicação que permitem agentes interagirem com o mundo externo.

## Providers Disponíveis

| Provider | Descrição | Arquivo Principal |
|----------|-----------|-------------------|
| Discord | Canal Discord (guild + DM) | `discord-account.ts` |
| Internal Chat | Chat interno entre agentes | `internal-chat-service.ts` |
| Email | Integração com Migadu | `email/migadu-manager.ts` |

## Arquitetura de Comunicação

```
┌─────────────────────────────────────────┐
│         Communication Providers          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ Discord  │ │Internal  │ │  Email   ││
│  │Provider  │ │  Chat    │ │Provider  ││
│  └─────┬────┘ └────┬─────┘ └────┬─────┘│
│        │           │            │       │
│        └───────────┼────────────┘       │
│                    ▼                    │
│           ┌────────────────┐           │
│           │ Provider Loader│           │
│           └───────┬────────┘           │
│                   │                    │
│                   ▼                    │
│          ┌─────────────────┐          │
│          │ AgentRuntime    │          │
│          │ processInbound()│          │
│          └─────────────────┘          │
└───────────────────────────────────────┘
```

## Provider Interface

```typescript
interface CommunicationProvider {
  // Identificação
  type: 'discord' | 'internal-chat' | 'email';
  
  // Enviar mensagem
  sendMessage(input: CommunicationOutboundMessage): Promise<CommunicationOutboundResult>;
  
  // Listar mensagens (opcional)
  listMessages?(options?: ListMessagesOptions): Promise<CommunicationInboundMessage[]>;
  
  // Health check (opcional)
  healthcheck?(): Promise<boolean>;
  
  // Cleanup
  dispose(): Promise<void>;
}
```

## Message Flow

### Inbound (Receber)

```
Mensagem Recebida
       │
       ▼
┌─────────────────────────────┐
│ Provider processa mensagem  │
│ - Parse mensagem           │
│ - Extrair remetente        │
│ - Extrair conteúdo         │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Filtros                     │
│ - Canais configurados?     │
│ - Menções (se requerido)?  │
│ - Echo prevention?         │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ AgentRunner.processInbound()│
│ - Criar CommunicationInbound│
│ - Passar para agente       │
└─────────────────────────────┘
```

### Outbound (Enviar)

```
Agente gera resposta
       │
       ▼
┌─────────────────────────────┐
│ AgentRuntime.sendResponse()│
│ - Preparar mensagem        │
│ - Serializar anexos        │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Provider.sendMessage()      │
│ - Formatar para provider   │
│ - Enviar                   │
└─────────────────────────────┘
       │
       ▼
   Confirmação
```

## Provider Loader

```typescript
// apps/forge/src/communication/provider-loader.ts
interface ProviderCredentials {
  type: 'discord' | 'internal-chat' | 'email';
  credentials: unknown;
}

async function loadCommunicationProviders(
  credentialsList: ProviderCredentials[]
): Promise<CommunicationProvider[]> {
  const providers: CommunicationProvider[] = [];
  
  for (const cred of credentialsList) {
    switch (cred.type) {
      case 'discord':
        providers.push(createDiscordProvider(cred.credentials));
        break;
      case 'internal-chat':
        providers.push(createInternalChatProvider(cred.credentials));
        break;
      case 'email':
        providers.push(createEmailProvider(cred.credentials));
        break;
    }
  }
  
  return providers;
}
```

## Configuração de Providers

Providers são configurados por agente no banco de dados:

```typescript
interface AgentProvider {
  id: string;
  agentId: string;
  providerType: 'discord' | 'internal-chat' | 'email';
  encryptedCredentials: string;  // Criptografado com AES-GCM
}
```

## Channels

Agentes podem se comunicar em múltiplos channels simultaneamente:

```typescript
interface DiscordCredentials {
  token: string;
  channels: Array<{
    channelId: string;
    respondToMentionsOnly: boolean;
  }>;
}

// Exemplo: Agente responde em 2 canais
{
  token: "Bot xxx",
  channels: [
    { channelId: "123456", respondToMentionsOnly: false },
    { channelId: "789012", respondToMentionsOnly: true }
  ]
}
```
