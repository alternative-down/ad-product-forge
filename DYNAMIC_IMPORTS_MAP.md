# Mapa: Dynamic Imports — #1548

## Resumo

Encontradas **9 ocorrências** de `await import()` em código fonte (não testes), spread entre 5 categorias.

## Lista Completa

### 1. `playwright` — ✅ Justificado

| File | Line | Context |
|------|------|---------|
| `apps/forge/src/browser-automation/service.ts` | 64 | Dentro de `BrowserAutomationService` |

**Justificativa**: Chromium pesa ~150MB. Manter dinâmico evita carregar o browser na memória de todos os agentes. Apenas quem realmente usa browser automation paga o custo de carregamento.

### 2. `postal-mime` — ❌ Desjustificado

| File | Line | Context |
|------|------|---------|
| `apps/forge/src/email-account.ts` | 160 | Dentro de `parseMimeMessage()` |
| `apps/forge/src/email-account.ts` | 224 | Dentro de `buildMimeMessage()` |

**Justificativa**: Biblioteca leve de parsing (~30KB). Sem benefício mensurável. Deve ser convertido para `import { PostalMime } from 'postal-mime'` estático.

### 3. `node:fs/promises` — ❌ Desjustificado

| File | Line | Context |
|------|------|---------|
| `apps/forge/src/admin/read-model/agents.ts` | 533 | Dentro de `getWorkspaceAgentContext()` |
| `packages/agent-runtime-core/src/integrations/persistence/filesystem-skill-registry.ts` | 38 | Dentro de `unregisterSkill()` |

**Justificativa**: Built-in do Node.js, já lazy-loaded internamente pelo runtime. Importação dinâmica é redundante. Deve ser `import { ... } from 'node:fs/promises'` estático.

### 4. `./agent-loader` — ❌ Desjustificado

| File | Line | Context |
|------|------|---------|
| `apps/forge/src/agents/hire-agent.ts` | 127 | Dentro de `hireInternalAgent()` |
| `apps/forge/src/agents/internal-agent-registry.ts` | 18 | Dentro de `loadAll()` |
| `apps/forge/src/agents/internal-agent-registry.ts` | 54 | Dentro de `getOrLoadAgent()` |

**Justificativa**: Módulo de lógica de aplicação leve. Não há biblioteca pesada para justificar lazy loading. Deve ser `import { loadAgent, loadAgents } from './agent-loader'` estático.

### 5. `octokit` — ⚠️ Ambíguo

| File | Line | Context |
|------|------|---------|
| `apps/forge/src/github/ops/routing.ts` | 96 | Dentro de callback de webhook |
| `apps/forge/src/github/apps.ts` | 106 | Dentro de `createGitHubApp()` (CommonJS `require`) |

**Justificativa**: Biblioteca de API (~500KB). Não está no hot path — só executa em flows de setup/admin de GitHub Apps. ⚠️ Pendente de análise de tamanho real em bundle. Poderia ser estático se o bundle impact for acceptable.

**Nota**: `apps.ts` usa `require('octokit')` (CommonJS) enquanto `routing.ts` usa `await import('octokit')` (ESM) — inconsistência entre os dois locais.

## Resumo por Categoria

| Módulo | Ocorrências | Justificado? | Ação Recomendada |
|--------|-------------|-------------|------------------|
| `playwright` | 1 | ✅ Sim | Manter dinâmico |
| `postal-mime` | 2 | ❌ Não | Converter para estático |
| `node:fs/promises` | 2 | ❌ Não | Converter para estático |
| `./agent-loader` | 3 | ❌ Não | Converter para estático |
| `octokit` | 2 | ⚠️ Ambíguo | Avaliar peso, possivelmente estático |

## Contagem

- **Total**: 9 ocorrências
- **Provavelmente justificadas**: 1 (`playwright`)
- **Provavelmente desjustificadas**: 7 (`postal-mime` × 2, `node:fs/promises` × 2, `./agent-loader` × 3)
- **Pendentes**: 2 (`octokit`)

## Conclusão

Apenas `playwright` claramente justifica o uso de import dinâmica pelo peso do Chromium. Os demais 7 são candidatos para conversão para imports estáticos. `octokit` precisa de análise de impacto em bundle para decidir.