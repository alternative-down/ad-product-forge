# Integrações

## GitHub

### GitHubAppManager

Gerencia GitHub Apps para os agentes.

```typescript
const github = createGitHubAppManager({
  appId: string;
  privateKey: string;
  installationId: number;
});
```

Responsabilidades:
- Gerencia tokens de instalação
- Cria webhooks
- Opera repositórios (issues, PRs, commits)
- Gerencia credenciais por agente

Arquivo principal: `apps/forge/src/github/manager.ts` (1477 linhas)

### Operations

```typescript
// Criar issue
await github.createIssue({
  repo: 'ad-product-forge',
  owner: 'alternative-down',
  title: 'Bug encontrado',
  body: 'Descrição do bug',
});

// Criar PR
await github.createPullRequest({
  repo: 'ad-product-forge',
  owner: 'alternative-down',
  title: 'Fix bug',
  head: 'fix-branch',
  base: 'develop',
});

// Commitar arquivo
await github.commitFile({
  repo: 'ad-product-forge',
  owner: 'alternative-down',
  path: 'README.md',
  content: 'Novo conteúdo',
  message: 'Update README',
  branch: 'main',
});
```

## Coolify

### CoolifyManager

Gerencia deploys via Coolify.

```typescript
const coolify = createCoolifyManager({
  apiKey: string;
  baseUrl: string;
});
```

Responsabilidades:
- Listar aplicações
- Deployar versões
- Gerenciar environment variables
- Ver logs de deployment

Arquivo principal: `apps/forge/src/coolify/manager.ts` (742 linhas)

### Operations

```typescript
// Listar aplicações
const apps = await coolify.listApplications();

// Deployar
await coolify.deployApplication({
  applicationUuid: 'uuid',
  image: 'ghcr.io/org/image:tag',
  environmentVariables: { NODE_ENV: 'production' },
});

// Atualizar env
await coolify.updateEnvironmentVariables({
  applicationUuid: 'uuid',
  variables: [{ key: 'API_URL', value: 'https://api.example.com' }],
});
```

## System Integrations

### createSystemIntegrationStore

Store unificado para configurações de integrações.

```typescript
const integrations = createSystemIntegrationStore(db);

// Listar
integrations.listByType('coolify');
integrations.listByType('github');
integrations.listByType('migadu');
integrations.listByType('minimax');

// Atualizar
await integrations.updateByType('coolify', {
  adminToken: 'token',
  webhookSecret: 'secret',
});

// Obter config descriptografado
const coolifyConfig = integrations.getCoolifyConfig();
```

## Email (Migadu)

### AgentEmailManager

Gerencia mailboxes para agentes via Migadu.

```typescript
const email = createAgentEmailManager({
  apiKey: string;
  apiBaseUrl: string;
  domain: string;
});
```

Responsabilidades:
- Provisionar mailboxes para agentes
- Deletar mailboxes
- Buscar emails via IMAP

### Operations

```typescript
// Provisionar mailbox
await email.provisionMailbox({
  agentId: 'agent-uuid',
  agentName: 'Orion',
});

// Deletar mailbox
await email.deleteAgentMailbox('agent-uuid');
```

## MiniMax

### MiniMaxManager

Integração com MiniMax API (LLM).

```typescript
const minimax = createMiniMaxManager({
  apiKey: string,
  groupId: string,
});
```

## Concurrency

A maioria das operações de integração suporta paralelismo:

```typescript
const results = await Promise.all([
  github.createIssue({ ... }),
  coolify.deployApplication({ ... }),
  email.provisionMailbox({ ... }),
]);
```

## Error Handling

Todas as integrações usam `forgeDebug` para logging:

```typescript
forgeDebug({ 
  scope: 'github/manager', 
  level: 'error', 
  message: 'Failed to create issue', 
  context: { error } 
});
```

Erros de integração são tratados como "graceful degradation" quando possível — o sistema continua funcionando mesmo se uma integração falhar.
