# Troubleshooting

## Common Issues

### Agent Does Not Start

**Symptom**: Agent stays in `absent` after hire.

**Causes**:
1. Invalid provider credentials
2. Expired Discord token
3. Invalid LLM API key

**Solution**:
```bash
# Check logs
curl http://localhost:3000/admin/agent/:agentId/logs

# Test provider
curl http://localhost:3000/admin/agent/:agentId/provider/test

# Update credentials
curl -X PUT http://localhost:3000/admin/agent-provider \
  -H "Content-Type: application/json" \
  -d '{"providerType": "discord", "credentials": {"token": "new-token"}}'
```

### Discord Provider Not Connecting

**Symptom**: `Discord provider failed` in log.

**Solution**:
1. Check token at https://discord.com/developers
2. Enable Message Content Intent in Bot settings
3. Check rate limits at https://discord.status

### Schedule Not Executing

**Symptom**: Agent does not trigger nextStep.

**Solution**:
```bash
# Check schedule
curl http://localhost:3000/admin/schedules?agentId=:agentId

# Reactivate schedule
curl -X POST http://localhost:3000/admin/schedule/:scheduleId/toggle

# Reset next step
curl -X PUT http://localhost:3000/admin/schedule/:scheduleId \
  -H "Content-Type: application/json" \
  -d '{"nextStepAt": null}'
```

### Budget Exhausted

**Symptom**: Agent stops executing, `budget_usd <= 0`.

**Solution**:
```bash
# Check contract
curl http://localhost:3000/admin/agent/:agentId/contract

# Add budget
curl -X POST http://localhost:3000/admin/finance/top-up \
  -H "Content-Type: application/json" \
  -d '{"agentId": "uuid", "amountUsd": 500}'
```

### Provider Loader Fails Silently

**Symptom**: Agent does not receive messages but no error.

**Solution**:
```bash
# Test all providers
curl http://localhost:3000/admin/agent/:agentId/providers
```

## Database Errors

### Migration Failed

**Solution**:
```bash
# Check pending migrations
npm run db:status

# Reset migrations (dev only)
rm -rf ./migrations/meta/*
npm run db:generate
npm run db:migrate
```

### Lock Timeout

**Cause**: Concurrent operations on SQLite.

**Solution**:
```typescript
for (let i = 0; i < 3; i++) {
  try {
    await db.insert(agents).values({...});
    break;
  } catch (error) {
    if (error.message.includes('locked')) {
      await sleep(1000);
    } else {
      throw error;
    }
  }
}
```

## LLM Errors

### Rate Limit

**Symptom**: `429 Too Many Requests`.

**Solution**: Implement exponential backoff.

### Context Overflow

**Symptom**: `Maximum context exceeded`.

**Solution**:
```bash
curl -X PUT http://localhost:3000/admin/system/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "checkpointing.om_recent_raw_tokens", "value": "5000"}'
```

## Integration Errors

### GitHub Token Expired

**Solution**:
```bash
curl -X POST http://localhost:3000/admin/github/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"installationId": 123}'
```

### Coolify API Unreachable

**Solution**: Check Coolify status, verify API URL, check firewall.

## Debugging

### Enable Verbose Logs

```bash
export LOG_LEVEL=debug
npm run dev
```

### Inspect Registry

```typescript
const registry = getInternalAgentRegistry();
const agents = registry.list();
console.log('Agents:', agents.map(a => ({ id: a.runtime.id, status: a.runner.status })));
```

## Recovery Procedures

### Agent in Infinite Loop

**Solution**:
```bash
# Stop agent
curl -X POST http://localhost:3000/admin/agent/:agentId/stop

# Clear state
curl -X DELETE http://localhost:3000/admin/agent/:agentId/pending-messages

# Restart
curl -X POST http://localhost:3000/admin/agent/:agentId/wake
```

### Corrupted LTM

**Solution**:
```bash
# Clear checkpointed state
curl -X DELETE http://localhost:3000/admin/agent/:agentId/om-state
```

### Full Disk

**Solution**:
```bash
# Clean old workspaces
rm -rf ./workspaces/*-archived

# Clean old logs
find ./logs -mtime +30 -delete
```
