# Ferramentas Coolify

## listApplications

Listar todas as aplicações.

```typescript
const apps = await tools.coolify.listApplications();

apps.forEach(app => {
  console.log(`${app.name} - ${app.status}`);
});
```

## deployApplication

Deployar uma aplicação.

```typescript
await tools.coolify.deployApplication({
  applicationUuid: 'uuid-da-aplicacao',
  image: 'ghcr.io/org/image:tag',
  environmentVariables: {
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com',
  },
});
```

## updateEnvironmentVariables

Atualizar variáveis de ambiente.

```typescript
await tools.coolify.updateEnvironmentVariables({
  applicationUuid: 'uuid-da-aplicacao',
  variables: [
    { key: 'API_URL', value: 'https://api.example.com' },
    { key: 'DEBUG', value: 'false' },
  ],
});
```

## getLogs

Obter logs de uma aplicação.

```typescript
const logs = await tools.coolify.getLogs({
  applicationUuid: 'uuid-da-aplicacao',
  limit: 100,
  since: Date.now() - 60 * 60 * 1000,
});
```
