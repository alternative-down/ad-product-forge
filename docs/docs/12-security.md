# Segurança

## Credenciais

### Armazenamento

Todas as credenciais são criptografadas com AES-256-GCM antes de serem armazenadas no banco.

```typescript
// Criptografar
import { encryptSecret } from './encryption/crypto';

const encrypted = encryptSecret(JSON.stringify(credentials));
// Salva no banco como encryptedCredentials
```

### Rotação

- Credenciais devem ser rotacionadas periodicamente
- Tokens Discord expiram — monitorar e atualizar

### Acesso

- Apenas admins com credenciais de sistema podem atualizar providers
- Usar HTTPS para todas as APIs

## Criptografia

### AES-256-GCM

```typescript
import { encryptSecret, decryptSecret } from './encryption/crypto';

// Encriptar
const encrypted = encryptSecret('dados sensíveis');

// Descriptografar
const decrypted = decryptSecret(encrypted); // 'dados sensíveis'
```

### ENCRYPTION_KEY

Variável de ambiente obrigatória. Deve ser:
- 32 bytes (256 bits)
- Base64 encoded
- Gerada com: `openssl rand -base64 32`

```bash
# Verificar presença
echo $ENCRYPTION_KEY | wc -c  # deve ser 45 (44 + newline)
```

## Permissions

### Tool Permissions

Cada role define quais tools o agente pode executar:

```typescript
interface RoleToolPermission {
  roleId: string;
  toolId: string; // ex: 'github.create-issue'
}
```

### Verificação em Runtime

```typescript
// Antes de executar tool
const permissions = await db.select().from(roleToolPermissions)
  .where(eq(roleToolPermissions.roleId, agentRoleId));

const hasPermission = permissions.some(p => p.toolId === toolId);

if (!hasPermission) {
  throw new Error('Tool not permitted for this role');
}
```

### Workflow Permissions

```typescript
interface RoleWorkflowPermission {
  roleId: string;
  workflowId: string;
}
```

## Input Validation

### Zod Schemas

Todo input de API é validado com Zod:

```typescript
const schema = z.object({
  name: z.string().min(1).max(100),
  providerType: z.enum(['discord', 'internal-chat', 'email']),
  credentials: z.object({
    token: z.string().min(1),
    channels: z.array(z.object({
      channelId: z.string(),
      respondToMentionsOnly: z.boolean(),
    })),
  }),
});

// Validação falha retorna 400
const parsed = schema.safeParse(input);
if (!parsed.success) {
  return { status: 400, body: { error: parsed.error.message } };
}
```

## Rate Limiting

### Discord

- 50 requests/segundo (global)
- 10 requests/segundo (por guild)
- Implementar exponential backoff

### API Requests

- Implementar rate limit client-side
- Batch requests quando possível

## Network Security

### HTTPS

Produção deve usar HTTPS:
- Terminar TLS no proxy/reverse proxy
- HTTP/2 para performance

### Firewalls

- Apenas portas necessárias expostas
- Whitelist de IPs para admin API (se possível)

## Audit Log

### Eventos Auditados

| Evento | Descrição |
|--------|-----------|
| Agent hire | Novo agente criado |
| Agent termination | Agente removido |
| Provider update | Credenciais atualizadas |
| Budget change | Top-up ou ajuste |
| Permission change | Role modificado |

### Log Format

```typescript
forgeDebug({
  scope: 'audit',
  level: 'info',
  message: 'Agent hired',
  context: {
    agentId: 'uuid',
    roleId: 'role-uuid',
    timestamp: Date.now(),
    actor: 'admin-or-agent-id',
  },
});
```

## Best Practices

1. **Nunca commitar secrets** — usar environment variables
2. **Validar input** — Zod schemas em toda API
3. **Log events importantes** — auditoria e debug
4. **Rotacionar credenciais** — periodicamente
5. **Verificar permissions** — antes de executar tools
6. **Monitorar budget** — alertas para evitar overspend
7. **HTTPS em produção** — nunca HTTP

## Secrets Checklist

- [ ] ENCRYPTION_KEY configurado (32 bytes, base64)
- [ ] DATABASE_URL não exposto
- [ ] API keys em environment variables
- [ ] Tokens Discord válidos
- [ ] GitHub App credentials seguros
- [ ] Coolify API key rotacionado
- [ ] Migadu credentials atualizados
