# Integração MiniMax

## Visão Geral

MiniMax é um provedor LLM alternativo usado pelo Forge.

## Configuração

```bash
MINIMAX_API_KEY=your-api-key
MINIMAX_GROUP_ID=your-group-id
```

## MiniMaxManager

```typescript
const { createMiniMaxManager } = await import('./minimax/manager');

const minimax = createMiniMaxManager({
  apiKey: process.env.MINIMAX_API_KEY!,
  groupId: process.env.MINIMAX_GROUP_ID!,
});
```

## LLM Profile

```typescript
{
  id: 'minimax-primary',
  name: 'MiniMax Primary',
  provider: 'minimax',
  model: 'minimax-01',
  temperature: 0.7,
  maxTokens: 8192,
}
```
