# Integração GitHub

## Visão Geral

O Forge integra com GitHub via GitHub Apps, permitindo que agentes gerenciem issues, PRs, repositórios e muito mais.

## Arquivo Principal

`apps/forge/src/github/manager.ts` (~1477 linhas)

## Configuração

### Variáveis de Ambiente

```bash
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
GITHUB_APP_INSTALLATION_ID=12345678
```

### Credenciais do GitHub App

1. Crie um GitHub App em https://github.com/settings/apps
2. Configure as permissões necessárias
3. Gere uma chave privada
4. Instale o app no repositório
5. Obtenha o Installation ID

## GitHubAppManager

```typescript
const { createGitHubAppManager } = await import('./github/manager');

const github = createGitHubAppManager({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  installationId: parseInt(process.env.GITHUB_APP_INSTALLATION_ID!),
});
```

## Operações

### Issues

```typescript
// Criar issue
const issue = await github.createIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Bug encontrado',
  body: 'Descrição do bug',
  labels: ['bug'],
});

// Listar issues
const issues = await github.listIssues({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});

// Atualizar issue
await github.updateIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  title: 'Novo título',
  body: 'Nova descrição',
  labels: ['bug', 'high-priority'],
});

// Adicionar comentário
await github.addIssueComment({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  body: 'Este issue foi atribuído.',
});
```

### Pull Requests

```typescript
// Criar PR
const pr = await github.createPullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Fix bug #123',
  body: 'Descrição do fix',
  head: 'fix-branch',
  base: 'develop',
});

// Listar PRs
const prs = await github.listPullRequests({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});

// Obter PR
const pr = await github.getPullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  pullNumber: 456,
});

// Merge PR
await github.mergePullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  pullNumber: 456,
  mergeMethod: 'squash',  // 'squash', 'merge', 'rebase'
});
```

### Repositórios

```typescript
// Criar repositório
const repo = await github.createRepository({
  name: 'new-repo',
  description: 'Descrição',
  private: true,
  owner: 'alternative-down',
});

// Listar repositórios
const repos = await github.listRepositories({
  owner: 'alternative-down',
  type: 'all',  // 'all', 'owner', 'public', 'private', 'member'
});

// Obter repositório
const repo = await github.getRepository({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
});
```

### Arquivos

```typescript
// Obter arquivo
const file = await github.getFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  ref: 'main',  // branch, tag, ou commit SHA
});

// Commitar arquivo
await github.commitFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  content: '# Novo conteúdo',  // string base64 ou plain
  message: 'Update README',
  branch: 'main',
  committer: {
    name: 'Forge Bot',
    email: 'bot@example.com',
  },
});
```

### Labels e Milestones

```typescript
// Criar label
await github.createLabel({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  name: 'priority',
  color: 'ff0000',
  description: 'Issue prioritário',
});

// Criar milestone
const milestone = await github.createMilestone({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'v1.0.0',
  description: 'Primeira versão',
  dueOn: '2024-12-31T00:00:00Z',
});
```

## Permissions Necessárias

| Permissão | Descrição |
|-----------|-----------|
| `issues: write` | Criar e editar issues |
| `pull_requests: write` | Criar e editar PRs |
| `contents: write` | Commitar arquivos |
| `metadata: read` | Ler repositórios |

## Rate Limits

- 5000 requests/hora para authenticated requests
- Implementar backoff exponential em caso de 403

## Error Handling

```typescript
try {
  await github.createIssue({...});
} catch (error) {
  if (error.status === 403) {
    forgeDebug({
      scope: 'github/manager',
      level: 'error',
      message: 'Rate limit exceeded or insufficient permissions',
      context: { error }
    });
  }
}
```
