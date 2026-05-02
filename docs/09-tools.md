# Tools

## Overview

Tools are functions that agents can call during execution. Each tool has a defined signature and is verified against role permissions.

## Tool Infrastructure

### Base

```typescript
interface ToolDefinition {
  id: string;              // e.g., 'github.create-issue'
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
}
```

### Execution Flow

```
AgentRunner.generate()
  → LLM returns tool call (e.g., createIssue)
  → Verify role permission
  → Validate input with schema
  → Execute tool handler
  → Return result to LLM
```

## GitHub Tools

### Issues

```typescript
// Create issue
await tools.github.createIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Bug found',
  body: 'Description',
  labels: ['bug'],
});

// List issues
const issues = await tools.github.listIssues({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});

// Update issue
await tools.github.updateIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  title: 'New title',
});

// Add comment
await tools.github.addIssueComment({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  body: 'Comment',
});
```

### Pull Requests

```typescript
// Create PR
const pr = await tools.github.createPullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Fix bug',
  body: 'Description',
  head: 'fix-branch',
  base: 'develop',
});

// List PRs
const prs = await tools.github.listPullRequests({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});

// Merge PR
await tools.github.mergePullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  pullNumber: 456,
  mergeMethod: 'squash',
});
```

### Repositories

```typescript
// Create repo
const repo = await tools.github.createRepository({
  name: 'new-repo',
  description: 'Description',
  private: true,
});

// Get file
const file = await tools.github.getFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  ref: 'main',
});

// Commit file
await tools.github.commitFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  content: '# New content',
  message: 'Update README',
  branch: 'main',
});
```

### Labels and Milestones

```typescript
// Create label
await tools.github.createLabel({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  name: 'priority',
  color: 'ff0000',
});

// Create milestone
const milestone = await tools.github.createMilestone({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'v1.0.0',
  dueOn: '2024-12-31',
});
```

## Coolify Tools

```typescript
// List applications
const apps = await tools.coolify.listApplications();

// Deploy
await tools.coolify.deployApplication({
  applicationUuid: 'uuid',
  image: 'ghcr.io/org/image:tag',
});

// Update env vars
await tools.coolify.updateEnvironmentVariables({
  applicationUuid: 'uuid',
  variables: [{ key: 'API_URL', value: 'https://api.example.com' }],
});

// Get logs
const logs = await tools.coolify.getLogs({
  applicationUuid: 'uuid',
  limit: 100,
});
```

## Discord Tools

```typescript
// Send message
await tools.discord.sendMessage({
  channelId: '123456',
  content: 'Message',
});

// Send DM
await tools.discord.sendDM({
  userId: '789012',
  content: 'DM',
});

// With attachments
await tools.discord.sendMessage({
  channelId: '123456',
  content: 'Message',
  attachments: [{
    name: 'file.txt',
    data: new Uint8Array([...]),
    contentType: 'text/plain',
  }],
});
```

## Email Tools

```typescript
// Send email
await tools.email.send({
  to: 'user@example.com',
  cc: ['cc@example.com'],
  subject: 'Subject',
  body: 'Body',
});

// List messages
const messages = await tools.email.listMessages({
  since: Date.now() - 24 * 60 * 60 * 1000,
  limit: 50,
});
```

## MCP Tools

```typescript
// List tools
const tools = await tools.mcp.listTools({
  serverId: 'server-uuid',
});

// Execute
const result = await tools.mcp.execute({
  serverId: 'server-uuid',
  toolName: 'custom-tool',
  arguments: { arg1: 'value' },
});
```

## Schedule Tools

```typescript
// Create schedule
await tools.schedules.create({
  agentId: 'agent-uuid',
  scheduleType: 'cron',
  cronExpression: '0 * * * *',
});

// Update
await tools.schedules.update({
  scheduleId: 'schedule-uuid',
  cronExpression: '30 * * * *',
});

// Delete
await tools.schedules.delete({
  scheduleId: 'schedule-uuid',
});
```

## Permission Matrix

| Tool | Permission |
|------|------------|
| `github.createIssue` | `github.create-issue` |
| `github.createPullRequest` | `github.create-pull-request` |
| `github.commitFile` | `github.commit-file` |
| `coolify.deployApplication` | `coolify.deploy` |
| `discord.sendMessage` | `discord.send-message` |
| `email.send` | `email.send` |
| `schedules.create` | `schedules.manage` |
