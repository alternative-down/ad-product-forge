# Como Contribuir

## Fluxo de Trabalho

### 1. Atualizar develop

```bash
git checkout develop
git pull origin develop
```

### 2. Criar Branch

```bash
git checkout -b fix/issue-1234
# ou
git checkout -b feat/new-feature
```

### 3. Desenvolver

- Fazer mudanças
- Escrever testes
- Verificar que testes passam

### 4. Commit

```bash
git add .
git commit -m "fix(module): description of fix"
```

### 5. Push e PR

```bash
git push -u origin fix/issue-1234
```

Criar PR no GitHub pointing para `develop`.

### 6. Code Review

- Aguardar review
- Corrigir comments se necessário
- Aguardar merge por Veritas

## Commits

```
type(scope): description

Types:
- feat: nova feature
- fix: correção de bug
- refactor: refatoração
- test: testes
- docs: documentação
- chore: manutenção
```

### Exemplos

```bash
git commit -m "fix(agent-runner): resolve timeout not being applied"
git commit -m "feat(discord): add DM support"
git commit -m "docs(api): add schedule endpoints documentation"
git commit -m "test(github): add tests for createIssue"
```

## PR Description

```markdown
## O que foi feito

Descrição do que foi feito.

## Issue relacionada

Closes #1234

## Checklist

- [ ] Testes adicionados/atualizados
- [ ] Código followa padrões
- [ ] Documentação atualizada (se necessário)
```

## Código Review Checklist

- [ ] Código está claro e legível
- [ ] Testes cobrem o comportamento
- [ ] Não há console.log ou debug
- [ ] Imports estão corretos
- [ ] Tipos estão corretos
- [ ] Erros são tratados
- [ ] Performance considerada

## Branches

| Branch | Uso |
|--------|-----|
| main | Produção |
| stage | Staging |
| develop | Integração |
| fix/* | Correções |
| feat/* | Features |
| docs/* | Documentação |
