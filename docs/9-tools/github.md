# Ferramentas GitHub

## createIssue

Criar um novo issue.

```typescript
await tools.github.createIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Bug encontrado',
  body: 'Descrição do bug',
  labels: ['bug'],
});
```

## listIssues

Listar issues de um repositório.

```typescript
const issues = await tools.github.listIssues({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',  // 'open', 'closed', 'all'
  labels: ['bug'],
});
```

## updateIssue

Atualizar um issue existente.

```typescript
await tools.github.updateIssue({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  title: 'Novo título',
  body: 'Nova descrição',
  labels: ['bug', 'high-priority'],
  state: 'open',
});
```

## addIssueComment

Adicionar comentário a um issue.

```typescript
await tools.github.addIssueComment({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  issueNumber: 123,
  body: 'Este issue foi atribuído ao time.',
});
```

## createPullRequest

Criar um pull request.

```typescript
const pr = await tools.github.createPullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  title: 'Fix bug #123',
  body: 'Descrição do fix',
  head: 'fix-branch',
  base: 'develop',
});
```

## listPullRequests

Listar pull requests.

```typescript
const prs = await tools.github.listPullRequests({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  state: 'open',
});
```

## mergePullRequest

Mergear um pull request.

```typescript
await tools.github.mergePullRequest({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  pullNumber: 456,
  mergeMethod: 'squash',  // 'squash', 'merge', 'rebase'
});
```

## commitFile

Commitar arquivo em um repositório.

```typescript
await tools.github.commitFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  content: '# Novo conteúdo',
  message: 'Update README',
  branch: 'main',
});
```

## getFile

Obter conteúdo de um arquivo.

```typescript
const file = await tools.github.getFile({
  owner: 'alternative-down',
  repo: 'ad-product-forge',
  path: 'README.md',
  ref: 'main',
});
```

## createRepository

Criar um novo repositório.

```typescript
const repo = await tools.github.createRepository({
  name: 'new-repo',
  description: 'Descrição',
  private: true,
  owner: 'alternative-down',
});
```

## listRepositories

Listar repositórios.

```typescript
const repos = await tools.github.listRepositories({
  owner: 'alternative-down',
  type: 'all',
});
```
