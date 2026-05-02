# Ferramentas MCP

## listTools

Listar tools disponíveis em um servidor MCP.

```typescript
const tools = await tools.mcp.listTools({
  serverId: 'server-uuid',
});
```

## execute

Executar uma tool MCP.

```typescript
const result = await tools.mcp.execute({
  serverId: 'server-uuid',
  toolName: 'custom-tool',
  arguments: {
    arg1: 'value1',
    arg2: 'value2',
  },
});
```
