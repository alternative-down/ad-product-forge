# Ferramentas Email

## send

Enviar email.

```typescript
await tools.email.send({
  to: ['recipient@example.com'],
  cc: ['cc@example.com'],
  subject: 'Assunto do Email',
  body: 'Corpo do email',
  attachments: [],
});
```

## listMessages

Listar mensagens do mailbox.

```typescript
const messages = await tools.email.listMessages({
  since: Date.now() - 24 * 60 * 60 * 1000,  // últimas 24h
  limit: 50,
  unreadOnly: false,
});
```
