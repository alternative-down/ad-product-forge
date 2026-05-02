# Integrations

## GitHub

### GitHubAppManager

Manages GitHub Apps for agents.

```typescript
const github = createGitHubAppManager({
  appId: string;
  privateKey: string;
  installationId: number;
});
```

File: `apps/forge/src/github/manager.ts` (1477 lines)

### Operations

```typescript
// Create issue
await github.createIssue({
  repo: 'ad-product-forge',
  owner: 'alternative-down',
  title: 'Bug found',
  body: 'Bug description',
  labels: ['bug'],
});

// Create PR
await github.createPullRequest({
  repo: 'ad-product-forge',
  owner: 'alternative-down',
  title: 'Fix bug',
  body: 'Description',
  head: 'fix-branch',
  base: 'develop',
});

// Commit file
await github.commitFile({
  repo: 'ad-product-forge',
  owner: 'alternative-down',
  path: 'README.md',
  content: '# New content',
  message: 'Update README',
  branch: 'main',
});
```

## Coolify

### CoolifyManager

Manages deployments via Coolify.

```typescript
const coolify = createCoolifyManager({
  apiKey: string;
  baseUrl: string;
});
```

File: `apps/forge/src/coolify/manager.ts` (742 lines)

### Operations

```typescript
// List applications
const apps = await coolify.listApplications();

// Deploy
await coolify.deployApplication({
  applicationUuid: 'uuid',
  image: 'ghcr.io/org/image:tag',
});

// Update env vars
await coolify.updateEnvironmentVariables({
  applicationUuid: 'uuid',
  variables: [{ key: 'API_URL', value: 'https://api.example.com' }],
});
```

## System Integrations

### createSystemIntegrationStore

Unified store for integration configurations.

```typescript
const integrations = createSystemIntegrationStore(db);

// List
integrations.listByType('coolify');
integrations.listByType('github');
integrations.listByType('migadu');
integrations.listByType('minimax');

// Update
await integrations.updateByType('coolify', {
  adminToken: 'token',
  webhookSecret: 'secret',
});
```

## Email (Migadu)

### AgentEmailManager

Manages agent mailboxes via Migadu.

```typescript
const email = createAgentEmailManager({
  apiKey: string;
  apiBaseUrl: string;
  domain: string;
});
```

### Operations

```typescript
// Provision mailbox
await email.provisionMailbox({
  agentId: 'agent-uuid',
  agentName: 'Orion',
});

// Delete mailbox
await email.deleteAgentMailbox('agent-uuid');
```

## MiniMax

### MiniMaxManager

MiniMax API integration (LLM).

```typescript
const minimax = createMiniMaxManager({
  apiKey: string,
  groupId: string,
});
```

## Concurrency

Most integration operations support parallelism:

```typescript
const results = await Promise.all([
  github.createIssue({ ... }),
  coolify.deployApplication({ ... }),
  email.provisionMailbox({ ... }),
]);
```

## Error Handling

All integrations use `forgeDebug` for logging:

```typescript
forgeDebug({
  scope: 'github/manager',
  level: 'error',
  message: 'Failed to create issue',
  context: { error },
});
```

Integration errors are handled as "graceful degradation" when possible.
