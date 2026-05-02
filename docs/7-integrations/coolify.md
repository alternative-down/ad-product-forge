# Integração Coolify

## Visão Geral

O Forge integra com Coolify para permitir que agentes gerenciem deploys e configurações de aplicações.

## Arquivo Principal

`apps/forge/src/coolify/manager.ts` (~742 linhas)

## Configuração

### Variáveis de Ambiente

```bash
COOLIFY_API_KEY=your-api-key
COOLIFY_BASE_URL=https://coolify.example.com
```

## CoolifyManager

```typescript
const { createCoolifyManager } = await import('./coolify/manager');

const coolify = createCoolifyManager({
  apiKey: process.env.COOLIFY_API_KEY!,
  baseUrl: process.env.COOLIFY_BASE_URL!,
});
```

## Operações

### Listar Aplicações

```typescript
const applications = await coolify.listApplications();

applications.forEach(app => {
  console.log(`${app.name} - ${app.status}`);
});
```

### Obter Aplicação

```typescript
const app = await coolify.getApplication({
  applicationUuid: 'uuid-da-aplicacao',
});
```

### Deployar Aplicação

```typescript
await coolify.deployApplication({
  applicationUuid: 'uuid-da-aplicacao',
  image: 'ghcr.io/org/image:tag',  // opcional, usa default se não especificado
  environmentVariables: {
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com',
  },
});
```

### Atualizar Environment Variables

```typescript
await coolify.updateEnvironmentVariables({
  applicationUuid: 'uuid-da-aplicacao',
  variables: [
    { key: 'API_URL', value: 'https://api.example.com' },
    { key: 'DEBUG', value: 'false' },
  ],
});
```

### Obter Logs

```typescript
const logs = await coolify.getLogs({
  applicationUuid: 'uuid-da-aplicacao',
  limit: 100,  // número de linhas
  since: Date.now() - 60 * 60 * 1000,  // últimas 1 hora (opcional)
});

// logs é array de linhas
logs.forEach(line => console.log(line));
```

### Status da Aplicação

```typescript
const status = await coolify.getApplicationStatus({
  applicationUuid: 'uuid-da-aplicacao',
});

// status: 'running', 'stopped', 'deploying', 'error'
```

## Permissions

O agente precisa de:
- API key com permissões de deploy
- Acesso à aplicação no Coolify

## Error Handling

```typescript
try {
  await coolify.deployApplication({...});
} catch (error) {
  if (error.code === 'COOLIFY_API_ERROR') {
    forgeDebug({
      scope: 'coolify/manager',
      level: 'error',
      message: 'Coolify API error',
      context: { error }
    });
  }
}
```
