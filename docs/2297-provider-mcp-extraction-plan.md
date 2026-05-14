# #2297 — provider-mcp.ts (394 LOC, 8 POST routes)

## File
`apps/forge/src/admin/routes/agents/provider-mcp.ts`

## Route Map

| # | Path | Handler LOC | Schema | DB tables | Reload |
|---|------|------------|--------|-----------|-------|
| 1 | POST /admin/agent-provider/upsert | 58 | upsertAgentProviderSchema | agentProviders | reloadAgentIfLoaded |
| 2 | POST /admin/agent-provider/delete | 25 | deleteAgentProviderSchema | agentProviders | reloadAgentIfLoaded |
| 3 | POST /admin/agent-mcp/create | 43 | createAgentMcpServerSchema | mcpServerConfigs, agentMcpConfigs | reloadAgentMcp |
| 4 | POST /admin/agent-mcp/update | 39 | updateAgentMcpServerSchema | mcpServerConfigs | reloadAgentMcp |
| 5 | POST /admin/agent-mcp/delete | 31 | deleteAgentMcpServerSchema | mcpServerConfigs, agentMcpConfigs | reloadAgentMcp |
| 6 | POST /admin/agent-mcp/assign | 52 | assignAgentMcpServerSchema | agentMcpConfigs | reloadAgentMcp |
| 7 | POST /admin/agent-mcp/set-active | 29 | setAgentMcpServerActiveSchema | agentMcpConfigs | reloadAgentMcp |
| 8 | POST /admin/agent-mcp/detach | 26 | detachAgentMcpServerSchema | agentMcpConfigs | reloadAgentMcp |

8 routes total. 394 LOC: 70 schemas + 12 factory + 312 handler code.

## Duplicate Patterns

1. **Error handling block** (8× identical): catch + forgeDebug + jsonResponse(500)
2. **Reload call** (8×, 2 variants): reloadAgentMcp vs reloadAgentIfLoaded
3. **findFirst query** (4 routes): same structure, different table
4. **Upsert pattern** (2 routes): if existing update else insert

## Extraction Plan (5 phases)

| Phase | File | Scope | LOC | Status |
|-------|------|-------|-----|--------|
| 1 | mcp-server-helpers.ts | create/update/delete mcp server | ~35 | pending |
| 2 | provider-helpers.ts | upsert/delete provider | ~30 | pending |
| 3 | route-error-helper.ts | adminRouteError() | ~5 | pending |
| 4 | mcp-config-helpers.ts | assign/set-active/detach | ~30 | pending |
| 5 | provider-mcp-schemas.ts | extract all schemas | 70 | pending |

Test file exists: provider-mcp.test.ts (530 LOC, 8 route tests). No new test scaffolding needed.

## Risks
- Low: Phase 3 (error helper) — pure extract, no behavior change
- Medium: Phases 1-2 — DB/encryption logic requires care
- Schema extraction (Phase 5) is cleanest last step

## Status
Investigated. Report sent to Thoren. Awaiting direction to proceed.