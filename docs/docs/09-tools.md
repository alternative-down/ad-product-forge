# Tools

## Overview

Tools são funções que os agentes podem chamar durante a execução. Cada tool tem uma assinatura definida e é verificada contra as permissions do role do agente.

## Tool Infrastructure

### Base

```typescript
interface ToolDefinition {
  id: string; // ex: 'github.create-issue'
  name: string; // ex: 'Create GitHub Issue'
  description: string; // descrição para o LLM
  inputSchema: z.ZodType; // schema de validação
  outputSchema?: z.ZodType; // schema do output
}
```

### Execution Flow

```
AgentRunner.generate()
  → LLM retorna tool call (ex: createIssue)
  → Verificar permission do role
  → Validar input com schema
  → Executar tool handler
  → Retornar resultado para LLM
```

## GitHub Tools

### Issues

```typescript
// Criar issue
const issue = await tools.github.createIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Bug encontrado',
  body: 'Descrição do bug',
  labels: ['bug'],
});

// Listar issues
const issues = await tools.github.listIssues({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
  labels: ['bug'],
});

// Atualizar issue
await tools.github.updateIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  title: 'Novo título',
  body: 'Novo body',
  labels: ['enhancement'],
});

// Adicionar comentário
await tools.github.addIssueComment({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  body: 'Comentário',
});
```

### Pull Requests

```typescript
// Criar PR
const pr = await tools.github.createPullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Fix bug',
  body: 'Descrição',
  head: 'fix-branch',
  base: 'develop',
});

// Listar PRs
const prs = await tools.github.listPullRequests({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});

// Obter PR
const pr = await tools.github.getPullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  pullNumber: 456,
});

// Merge PR
await tools.github.mergePullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  pullNumber: 456,
  mergeMethod: 'squash', // 'squash' | 'merge' | 'rebase'
});
```

### Repositories

```typescript
// Criar repo
const repo = await tools.github.createRepository({
  name: 'new-repo',
  description: 'Descrição',
  private: true,
  autoInit: true,
});

// Listar repos
const repos = await tools.github.listRepositories();

// Obter repo
const repo = await tools.github.getRepository({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
});

// Commit arquivo
await tools.github.commitFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  content: '# Novo conteúdo',
  message: 'Update README',
  branch: 'main',
  committer: {
    name: 'Agent Name',
    email: 'agent@example.com',
  },
});
```

### Labels e Milestones

```typescript
// Criar label
await tools.github.createLabel({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  name: 'priority',
  color: 'ff0000',
  description: 'High priority',
});

// Listar labels
const labels = await tools.github.listLabels({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
});

// Criar milestone
const milestone = await tools.github.createMilestone({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'v1.0.0',
  dueOn: '2024-12-31',
});

// Listar milestones
const milestones = await tools.github.listMilestones({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});
```

### Git Operations

```typescript
// Obter arquivo
const file = await tools.github.getFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  ref: 'main',
});

// Listar branches
const branches = await tools.github.listBranches({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
});

// Criar branch
await tools.github.createBranch({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  name: 'new-branch',
  from: 'main',
});
```

## Coolify Tools

### Applications

```typescript
// Listar aplicações
const apps = await tools.coolify.listApplications();

// Obter aplicação
const app = await tools.coolify.getApplication({
  applicationUuid: 'uuid',
});

// Obter logs
const logs = await tools.coolify.getLogs({
  applicationUuid: 'uuid',
  limit: 100,
});
```

### Deployment

```typescript
// Deployar aplicação
await tools.coolify.deployApplication({
  applicationUuid: 'uuid',
  image: 'ghcr.io/org/image:tag',
});

// Deploy com env vars
await tools.coolify.deployApplication({
  applicationUuid: 'uuid',
  image: 'ghcr.io/org/image:dev',
  environmentVariables: {
    NODE_ENV: 'development',
    DEBUG: 'true',
  },
});
```

### Environment Variables

```typescript
// Listar env vars
const vars = await tools.coolify.listEnvironmentVariables({
  applicationUuid: 'uuid',
});

// Atualizar env vars
await tools.coolify.updateEnvironmentVariables({
  applicationUuid: 'uuid',
  variables: [
    { key: 'API_URL', value: 'https://api.example.com' },
    { key: 'DEBUG', value: 'false' },
  ],
});
```

## Discord Tools

```typescript
// Enviar mensagem em canal
await tools.discord.sendMessage({
  channelId: '123456',
  content: 'Mensagem',
});

// Enviar DM
await tools.discord.sendDM({
  userId: '789012',
  content: 'DM',
});

// Com附件
await tools.discord.sendMessage({
  channelId: '123456',
  content: 'Mensagem',
  attachments: [{
    name: 'file.txt',
    data: new Uint8Array([...]),
    contentType: 'text/plain',
  }],
});
```

## Email Tools

```typescript
// Enviar email
await tools.email.send({
  to: 'user@example.com',
  cc: ['cc@example.com'],
  bcc: ['bcc@example.com'],
  subject: 'Assunto',
  body: 'Corpo do email',
  attachments: [{
    name: 'file.pdf',
    data: new Uint8Array([...]),
    contentType: 'application/pdf',
  }],
});

// Listar emails
const messages = await tools.email.listMessages({
  since: Date.now() - 24 * 60 * 60 * 1000,
  limit: 50,
  unreadOnly: false,
});
```

## MCP Tools

MCP (Model Context Protocol) tools são definidos dinamicamente via MCP servers.

```typescript
// Listar tools de um server
const tools = await tools.mcp.listTools({
  serverId: 'server-uuid',
});

// Executar tool MCP
const result = await tools.mcp.execute({
  serverId: 'server-uuid',
  toolName: 'custom-tool',
  arguments: { arg1: 'value' },
});
```

## Schedule Tools

```typescript
// Criar schedule
await tools.schedules.create({
  agentId: 'agent-uuid',
  scheduleType: 'cron',
  cronExpression: '0 * * * *', // a cada hora
});

// Atualizar schedule
await tools.schedules.update({
  scheduleId: 'schedule-uuid',
  cronExpression: '30 * * * *', // minuto 30
  isActive: true,
});

// Deletar schedule
await tools.schedules.delete({
  scheduleId: 'schedule-uuid',
});
```

## Tool Permissions Matrix

| Tool                        | Permission Required          |
| --------------------------- | ---------------------------- |
| `github.createIssue`        | `github.create-issue`        |
| `github.createPullRequest`  | `github.create-pull-request` |
| `github.commitFile`         | `github.commit-file`         |
| `github.mergePullRequest`   | `github.merge-pull-request`  |
| `coolify.deployApplication` | `coolify.deploy`             |
| `coolify.listApplications`  | `coolify.read`               |
| `discord.sendMessage`       | `discord.send-message`       |
| `email.send`                | `email.send`                 |
| `schedules.create`          | `schedules.manage`           |
| `mcp.execute`               | `mcp.execute`                |
