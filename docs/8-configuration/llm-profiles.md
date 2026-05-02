# Perfis LLM

## O que são LLM Profiles

LLM Profiles definem configurações para modelos de linguagem que os agentes usam.

```typescript
interface LlmProfile {
  id: string;                  // UUID
  name: string;               // Nome: "primary", "om"
  provider: 'openai' | 'minimax' | 'anthropic';
  model: string;             // Nome do modelo
  temperature: number;       // 0-2 (default: 0.7)
  maxTokens: number;        // Máximo de tokens na resposta
}
```

## Perfis Padrão

### primary

Para execução normal de agentes.

```typescript
{
  id: 'profile-primary',
  name: 'primary',
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 4096,
}
```

### om (Operational Memory)

Para tarefas de memória operacional.

```typescript
{
  id: 'profile-om',
  name: 'om',
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.3,
  maxTokens: 8192,
}
```

## Providers Suportados

### OpenAI

```typescript
{
  provider: 'openai',
  model: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo',
}
```

### MiniMax

```typescript
{
  provider: 'minimax',
  model: 'minimax-01',
}
```

### Anthropic

```typescript
{
  provider: 'anthropic',
  model: 'claude-3-opus' | 'claude-3-sonnet',
}
```

## Configurar Perfil

```bash
curl -X POST http://localhost:3000/admin/system/llm-profile \
  -H "Content-Type: application/json" \
  -d '{
    "name": "primary",
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 4096
  }'
```

## Temperatura

| Temperatura | Uso |
|-------------|-----|
| 0.0 - 0.3 | Tarefas precisas (código, facts) |
| 0.4 - 0.7 | Uso geral (conversa, descrição) |
| 0.8 - 1.0 | Tarefas criativas (brainstorming) |
| 1.0+ | Caótico (não recomendado) |

## Max Tokens

Controla o tamanho máximo da resposta.

| Modelo | Max Tokens |
|--------|-----------|
| gpt-4 | 8192 |
| gpt-4-turbo | 16384 |
| gpt-3.5-turbo | 16384 |
| claude-3-opus | 4096 |
| claude-3-sonnet | 4096 |

## Configuração por Agente

Cada agente pode ter seu próprio perfil:

```typescript
// Em hiring
await hireAgent({
  name: 'Dev Agent',
  roleId: 'role-uuid',
  llmProfile: {
    name: 'primary',
    provider: 'openai',
    model: 'gpt-4-turbo',
    temperature: 0.5,
    maxTokens: 8192,
  },
});
```
