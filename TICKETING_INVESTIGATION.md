# Investigação: Ticketing Routes — #1590

## Contexto

Issue #1590 reporta que `apps/forge/src/admin/routes/ticketing/index.ts` define rotas de ticketing mas não está registrado em `registerAdminRoutes()`.

## Resultado da Investigação

### Ficheiros Ticketing Encontrados

Apenas **1 ficheiro** relacionado a ticketing existe no codebase:

```
apps/forge/src/ticketing/service.ts   (325 linhas)
apps/forge/src/ticketing/service.test.ts
```

### O Ficheiro `ticketing/service.ts`

- Exporta `createTicketingService(db)` que implementa a interface `CommunicationProvider`
- É um **communication provider**, não rotas HTTP de admin
- Gerencia tickets via interface de provider (ingestão de tickets, conversas)
- Não define rotas HTTP de admin

### O Ficheiro `admin/routes/ticketing/index.ts`

- **NÃO EXISTE** — foi deletado em `#1406` (chore(1378): delete 50 unused files)
- A issue refere-se a um ficheiro que já não existe no codebase

### Histórico de Git

O ficheiro `admin/routes/ticketing/index.ts` foi deletado no commit `3f17092b` (PR #1406):
```
chore(1378): delete 50 unused files (-6009 lines) (#1406)
Delete files flagged as unused by fallow dead-code analysis:
  forge (9 files):
  - admin/routes/ticketing/index.ts   ← DELETADO AQUI
  - agents/agent-runtime-platform.ts
  ...
```

### Utilização Atual

O `ticketing/service.ts` é um **CommunicationProvider** que:
- É carregado via `provider-loader.ts` como parte do sistema de providers de comunicação
- Não é usado como rotas HTTP de admin
- Não está referenciado em `registerAdminRoutes()`

### Onde Está o Ticketing?

```
ticketing/service.ts        → CommunicationProvider (ativo, usado por provider-loader)
admin/routes/ticketing/     → NÃO EXISTE (deletado em #1406)
```

## Conclusão

| Item | Status |
|------|--------|
| `admin/routes/ticketing/index.ts` | ❌ Não existe — deletado em #1406 |
| `ticketing/service.ts` (CommunicationProvider) | ✅ Ativo — usado pelo provider-loader |
| Rotas HTTP de admin para ticketing | ❌ Não existem — nunca foram integradas |
| ticketing como provider de comunicação | ✅ Funcional — integrado via provider-loader |

**A issue reporta um problema que já foi resolvido** — o ficheiro de rotas de ticketing foi identificado como dead code e removido em #1406. O `ticketing/service.ts` é um communication provider e não precisa de rotas HTTP de admin.