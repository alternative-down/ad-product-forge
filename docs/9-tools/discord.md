# Ferramentas Discord

## sendMessage

Enviar mensagem para um canal.

```typescript
await tools.discord.sendMessage({
  channelId: '123456789',
  content: 'Olá! Como posso ajudar?',
});
```

## sendDM

Enviar mensagem direta a um usuário.

```typescript
await tools.discord.sendDM({
  userId: '987654321',
  content: 'Mensagem privada',
});
```

## sendMessage (com anexos)

```typescript
await tools.discord.sendMessage({
  channelId: '123456789',
  content: 'Segue o arquivo:',
  attachments: [
    {
      name: 'file.txt',
      data: new Uint8Array([...]),
      contentType: 'text/plain',
    },
  ],
});
```
