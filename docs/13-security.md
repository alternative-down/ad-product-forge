# Security

## Credentials

### Storage

All credentials encrypted with AES-256-GCM before database storage.

```typescript
import { encryptSecret } from './encryption/crypto';

const encrypted = encryptSecret(JSON.stringify(credentials));
```

### Rotation

- Credentials should be rotated periodically
- Discord tokens expire — monitor and update

### Access

- Only admins with system credentials can update providers
- Use HTTPS for all APIs

## Encryption

### AES-256-GCM

```typescript
import { encryptSecret, decryptSecret } from './encryption/crypto';

// Encrypt
const encrypted = encryptSecret('sensitive data');

// Decrypt
const decrypted = decryptSecret(encrypted);
```

### ENCRYPTION_KEY

Required environment variable. Must be:
- 32 bytes (256 bits)
- Base64 encoded
- Generated with: `openssl rand -base64 32`

```bash
# Check presence
echo $ENCRYPTION_KEY | wc -c  # should be 45 (44 + newline)
```

## Permissions

### Tool Permissions

Each role defines which tools the agent can execute:

```typescript
interface RoleToolPermission {
  roleId: string;
  toolId: string;
}
```

### Runtime Verification

```typescript
const permissions = await db.select().from(roleToolPermissions)
  .where(eq(roleToolPermissions.roleId, agentRoleId));

const hasPermission = permissions.some(p => p.toolId === toolId);
if (!hasPermission) {
  throw new Error('Tool not permitted for this role');
}
```

## Input Validation

Zod schemas for all API input:

```typescript
const schema = z.object({
  name: z.string().min(1).max(100),
  providerType: z.enum(['discord', 'internal-chat', 'email']),
});

const parsed = schema.safeParse(input);
if (!parsed.success) {
  return { status: 400, body: { error: parsed.error.message } };
}
```

## Rate Limiting

### Discord

- 50 requests/second (global)
- 10 requests/second (per guild)
- Implement exponential backoff

## Network Security

### HTTPS

Production must use HTTPS:
- Terminate TLS at proxy/reverse proxy
- HTTP/2 for performance

### Firewalls

- Only necessary ports exposed
- IP whitelist for admin API (if possible)

## Best Practices

1. **Never commit secrets** — use environment variables
2. **Validate input** — Zod schemas on all APIs
3. **Log important events** — audit and debug
4. **Rotate credentials** — periodically
5. **Verify permissions** — before executing tools
6. **Monitor budget** — alerts to avoid overspend
7. **HTTPS in production** — never HTTP

## Security Checklist

- [ ] ENCRYPTION_KEY configured (32 bytes, base64)
- [ ] DATABASE_URL not exposed
- [ ] API keys in environment variables
- [ ] Discord tokens valid
- [ ] GitHub App credentials secure
- [ ] Coolify API key rotated
- [ ] Migadu credentials updated
