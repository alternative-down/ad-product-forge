# Code Map

This file is a practical map of the current codebase for day-to-day navigation.

It does not try to explain every detail. It explains where each main responsibility currently lives.

## Application layer: `apps/forge/src`

### Admin routes: `apps/forge/src/admin/`

- [`admin/read-model.ts`](./apps/forge/src/admin/read-model.ts)
- [`admin/read-model/agents.test.ts`](./apps/forge/src/admin/read-model/agents.test.ts)
- [`admin/read-model/agents.ts`](./apps/forge/src/admin/read-model/agents.ts)
- [`admin/read-model/conversation-helpers.ts`](./apps/forge/src/admin/read-model/conversation-helpers.ts)
- [`admin/read-model/finance-overview.ts`](./apps/forge/src/admin/read-model/finance-overview.ts)
- [`admin/read-model/finance.ts`](./apps/forge/src/admin/read-model/finance.ts)
- [`admin/read-model/helpers-ltm.ts`](./apps/forge/src/admin/read-model/helpers-ltm.ts)
- [`admin/read-model/helpers.test.ts`](./apps/forge/src/admin/read-model/helpers.test.ts)
- [`admin/read-model/helpers.ts`](./apps/forge/src/admin/read-model/helpers.ts)
- [`admin/read-model/payables-overview.ts`](./apps/forge/src/admin/read-model/payables-overview.ts)
- [`admin/read-model/system.ts`](./apps/forge/src/admin/read-model/system.ts)
- [`admin/routes.ts`](./apps/forge/src/admin/routes.ts)
- [`admin/routes/agents/agent-routes.test.ts`](./apps/forge/src/admin/routes/agents/agent-routes.test.ts)
- [`admin/routes/agents/debug-write-ops.test.ts`](./apps/forge/src/admin/routes/agents/debug-write-ops.test.ts)
- [`admin/routes/agents/index.ts`](./apps/forge/src/admin/routes/agents/index.ts)
- [`admin/routes/agents/operations.test.ts`](./apps/forge/src/admin/routes/agents/operations.test.ts)
- [`admin/routes/agents/operations.ts`](./apps/forge/src/admin/routes/agents/operations.ts)
- [`admin/routes/agents/read.test.ts`](./apps/forge/src/admin/routes/agents/read.test.ts)
- [`admin/routes/agents/read.ts`](./apps/forge/src/admin/routes/agents/read.ts)
- [`admin/routes/agents/write-ops.ts`](./apps/forge/src/admin/routes/agents/write-ops.ts)
- [`admin/routes/agents/write.ts`](./apps/forge/src/admin/routes/agents/write.ts)
- [`admin/routes/finance/finance.test.ts`](./apps/forge/src/admin/routes/finance/finance.test.ts)
- [`admin/routes/finance/index.ts`](./apps/forge/src/admin/routes/finance/index.ts)
- [`admin/routes/finance/read.test.ts`](./apps/forge/src/admin/routes/finance/read.test.ts)
- [`admin/routes/finance/read.ts`](./apps/forge/src/admin/routes/finance/read.ts)
- [`admin/routes/finance/write.test.ts`](./apps/forge/src/admin/routes/finance/write.test.ts)
- [`admin/routes/finance/write.ts`](./apps/forge/src/admin/routes/finance/write.ts)
- [`admin/routes/helpers.test.ts`](./apps/forge/src/admin/routes/helpers.test.ts)
- [`admin/routes/helpers.ts`](./apps/forge/src/admin/routes/helpers.ts)
- [`admin/routes/index.ts`](./apps/forge/src/admin/routes/index.ts)
- [`admin/routes/internal-chat/index.test.ts`](./apps/forge/src/admin/routes/internal-chat/index.test.ts)
- [`admin/routes/internal-chat/index.ts`](./apps/forge/src/admin/routes/internal-chat/index.ts)
- [`admin/routes/mcp-helpers.test.ts`](./apps/forge/src/admin/routes/mcp-helpers.test.ts)
- [`admin/routes/mcp-helpers.ts`](./apps/forge/src/admin/routes/mcp-helpers.ts)
- [`admin/routes/schemas.test.ts`](./apps/forge/src/admin/routes/schemas.test.ts)
- [`admin/routes/schemas.ts`](./apps/forge/src/admin/routes/schemas.ts)
- [`admin/routes/system/healthcheck.test.ts`](./apps/forge/src/admin/routes/system/healthcheck.test.ts)
- [`admin/routes/system/healthcheck.ts`](./apps/forge/src/admin/routes/system/healthcheck.ts)
- [`admin/routes/system/index.ts`](./apps/forge/src/admin/routes/system/index.ts)
- [`admin/routes/system/read.ts`](./apps/forge/src/admin/routes/system/read.ts)
- [`admin/routes/system/write.ts`](./apps/forge/src/admin/routes/system/write.ts)
- [`admin/routes/validation.test.ts`](./apps/forge/src/admin/routes/validation.test.ts)
- [`admin/routes/validation.ts`](./apps/forge/src/admin/routes/validation.ts)
- [`admin/schemas.test.ts`](./apps/forge/src/admin/schemas.test.ts)
- [`admin/schemas.ts`](./apps/forge/src/admin/schemas.ts)

### Agents: `apps/forge/src/agents/`

- [`agents/adjust-agent-contract-budget.test.ts`](./apps/forge/src/agents/adjust-agent-contract-budget.test.ts)
- [`agents/adjust-agent-contract-budget.ts`](./apps/forge/src/agents/adjust-agent-contract-budget.ts)
- [`agents/agent-contract-store.test.ts`](./apps/forge/src/agents/agent-contract-store.test.ts)
- [`agents/agent-contract-store.ts`](./apps/forge/src/agents/agent-contract-store.ts)
- [`agents/agent-embedder-maintenance.test.ts`](./apps/forge/src/agents/agent-embedder-maintenance.test.ts)
- [`agents/agent-embedder-maintenance.ts`](./apps/forge/src/agents/agent-embedder-maintenance.ts)
- [`agents/agent-home-metric-snapshot-store.test.ts`](./apps/forge/src/agents/agent-home-metric-snapshot-store.test.ts)
- [`agents/agent-home-metric-snapshot-store.ts`](./apps/forge/src/agents/agent-home-metric-snapshot-store.ts)
- [`agents/agent-home-metrics.test.ts`](./apps/forge/src/agents/agent-home-metrics.test.ts)
- [`agents/agent-home-metrics.ts`](./apps/forge/src/agents/agent-home-metrics.ts)
- [`agents/agent-loader-data.test.ts`](./apps/forge/src/agents/agent-loader-data.test.ts)
- [`agents/agent-loader-data.ts`](./apps/forge/src/agents/agent-loader-data.ts)
- [`agents/agent-loader-runtime-config.test.ts`](./apps/forge/src/agents/agent-loader-runtime-config.test.ts)
- [`agents/agent-loader-runtime-config.ts`](./apps/forge/src/agents/agent-loader-runtime-config.ts)
- [`agents/agent-loader-tools.test.ts`](./apps/forge/src/agents/agent-loader-tools.test.ts)
- [`agents/agent-loader-tools.ts`](./apps/forge/src/agents/agent-loader-tools.ts)
- [`agents/agent-loader-types.ts`](./apps/forge/src/agents/agent-loader-types.ts)
- [`agents/agent-loader.ts`](./apps/forge/src/agents/agent-loader.ts)
- [`agents/agent-long-term-memory-recall.test.ts`](./apps/forge/src/agents/agent-long-term-memory-recall.test.ts)
- [`agents/agent-long-term-memory-recall.ts`](./apps/forge/src/agents/agent-long-term-memory-recall.ts)
- [`agents/agent-long-term-memory-store.test.ts`](./apps/forge/src/agents/agent-long-term-memory-store.test.ts)
- [`agents/agent-long-term-memory-store.ts`](./apps/forge/src/agents/agent-long-term-memory-store.ts)
- [`agents/agent-long-term-memory.test.ts`](./apps/forge/src/agents/agent-long-term-memory.test.ts)
- [`agents/agent-long-term-memory.ts`](./apps/forge/src/agents/agent-long-term-memory.ts)
- [`agents/agent-ltm-helpers.test.ts`](./apps/forge/src/agents/agent-ltm-helpers.test.ts)
- [`agents/agent-ltm-helpers.ts`](./apps/forge/src/agents/agent-ltm-helpers.ts)
- [`agents/agent-runner-context.test.ts`](./apps/forge/src/agents/agent-runner-context.test.ts)
- [`agents/agent-runner-context.ts`](./apps/forge/src/agents/agent-runner-context.ts)
- [`agents/agent-runner-helpers.test.ts`](./apps/forge/src/agents/agent-runner-helpers.test.ts)
- [`agents/agent-runner-helpers.ts`](./apps/forge/src/agents/agent-runner-helpers.ts)
- [`agents/agent-runner-loop-detector.test.ts`](./apps/forge/src/agents/agent-runner-loop-detector.test.ts)
- [`agents/agent-runner-loop-detector.ts`](./apps/forge/src/agents/agent-runner-loop-detector.ts)
- [`agents/agent-runner-messages.test.ts`](./apps/forge/src/agents/agent-runner-messages.test.ts)
- [`agents/agent-runner-messages.ts`](./apps/forge/src/agents/agent-runner-messages.ts)
- [`agents/agent-runner-scheduler.test.ts`](./apps/forge/src/agents/agent-runner-scheduler.test.ts)
- [`agents/agent-runner-scheduler.ts`](./apps/forge/src/agents/agent-runner-scheduler.ts)
- [`agents/agent-runner-usage.test.ts`](./apps/forge/src/agents/agent-runner-usage.test.ts)
- [`agents/agent-runner-usage.ts`](./apps/forge/src/agents/agent-runner-usage.ts)
- [`agents/agent-runner-wake.test.ts`](./apps/forge/src/agents/agent-runner-wake.test.ts)
- [`agents/agent-runner-wake.ts`](./apps/forge/src/agents/agent-runner-wake.ts)
- [`agents/agent-runner.ts`](./apps/forge/src/agents/agent-runner.ts)
- [`agents/agent-runtime-memory.test.ts`](./apps/forge/src/agents/agent-runtime-memory.test.ts)
- [`agents/agent-runtime-memory.ts`](./apps/forge/src/agents/agent-runtime-memory.ts)
- [`agents/agent-runtime-platform.test.ts`](./apps/forge/src/agents/agent-runtime-platform.test.ts)
- [`agents/agent-runtime-platform.ts`](./apps/forge/src/agents/agent-runtime-platform.ts)
- [`agents/agent-runtime-prompt.test.ts`](./apps/forge/src/agents/agent-runtime-prompt.test.ts)
- [`agents/agent-runtime-prompt.ts`](./apps/forge/src/agents/agent-runtime-prompt.ts)
- [`agents/agent-runtime-types.ts`](./apps/forge/src/agents/agent-runtime-types.ts)
- [`agents/base-tool-ids.test.ts`](./apps/forge/src/agents/base-tool-ids.test.ts)
- [`agents/base-tool-ids.ts`](./apps/forge/src/agents/base-tool-ids.ts)
- [`agents/bundled-workspace-skills.test.ts`](./apps/forge/src/agents/bundled-workspace-skills.test.ts)
- [`agents/bundled-workspace-skills.ts`](./apps/forge/src/agents/bundled-workspace-skills.ts)
- [`agents/create-forge-agent.ts`](./apps/forge/src/agents/create-forge-agent.ts)
- [`agents/global-skills.ts`](./apps/forge/src/agents/global-skills.ts)
- [`agents/hire-agent.test.ts`](./apps/forge/src/agents/hire-agent.test.ts)
- [`agents/hire-agent.ts`](./apps/forge/src/agents/hire-agent.ts)
- [`agents/hiring-profile.test.ts`](./apps/forge/src/agents/hiring-profile.test.ts)
- [`agents/hiring-profile.ts`](./apps/forge/src/agents/hiring-profile.ts)
- [`agents/hiring-rh.test.ts`](./apps/forge/src/agents/hiring-rh.test.ts)
- [`agents/hiring-rh.ts`](./apps/forge/src/agents/hiring-rh.ts)
- [`agents/internal-agent-lifecycle.ts`](./apps/forge/src/agents/internal-agent-lifecycle.ts)
- [`agents/internal-agent-registry.test.ts`](./apps/forge/src/agents/internal-agent-registry.test.ts)
- [`agents/internal-agent-registry.ts`](./apps/forge/src/agents/internal-agent-registry.ts)
- [`agents/internal-agent-tools.test.ts`](./apps/forge/src/agents/internal-agent-tools.test.ts)
- [`agents/internal-agent-tools.ts`](./apps/forge/src/agents/internal-agent-tools.ts)
- [`agents/mcp/client-manager.test.ts`](./apps/forge/src/agents/mcp/client-manager.test.ts)
- [`agents/mcp/client-manager.ts`](./apps/forge/src/agents/mcp/client-manager.ts)
- [`agents/mcp/store.ts`](./apps/forge/src/agents/mcp/store.ts)
- [`agents/migrate-legacy-checkpointed-om.test.ts`](./apps/forge/src/agents/migrate-legacy-checkpointed-om.test.ts)
- [`agents/migrate-legacy-checkpointed-om.ts`](./apps/forge/src/agents/migrate-legacy-checkpointed-om.ts)
- [`agents/normalize-operational-memory-messages.test.ts`](./apps/forge/src/agents/normalize-operational-memory-messages.test.ts)
- [`agents/normalize-operational-memory-messages.ts`](./apps/forge/src/agents/normalize-operational-memory-messages.ts)
- [`agents/pending-summary.test.ts`](./apps/forge/src/agents/pending-summary.test.ts)
- [`agents/pending-summary.ts`](./apps/forge/src/agents/pending-summary.ts)
- [`agents/renew-agent-contract.test.ts`](./apps/forge/src/agents/renew-agent-contract.test.ts)
- [`agents/renew-agent-contract.ts`](./apps/forge/src/agents/renew-agent-contract.ts)
- [`agents/skills-tools.ts`](./apps/forge/src/agents/skills-tools.ts)
- [`agents/terminate-agent.test.ts`](./apps/forge/src/agents/terminate-agent.test.ts)
- [`agents/terminate-agent.ts`](./apps/forge/src/agents/terminate-agent.ts)
- [`agents/top-up-agent-contract.test.ts`](./apps/forge/src/agents/top-up-agent-contract.test.ts)
- [`agents/top-up-agent-contract.ts`](./apps/forge/src/agents/top-up-agent-contract.ts)
- [`agents/workspace-skill-archive.test.ts`](./apps/forge/src/agents/workspace-skill-archive.test.ts)
- [`agents/workspace-skill-archive.ts`](./apps/forge/src/agents/workspace-skill-archive.ts)
- [`agents/workspace-skill-paths.test.ts`](./apps/forge/src/agents/workspace-skill-paths.test.ts)
- [`agents/workspace-skill-paths.ts`](./apps/forge/src/agents/workspace-skill-paths.ts)
- [`agents/workspace-skills.test.ts`](./apps/forge/src/agents/workspace-skills.test.ts)
- [`agents/workspace-skills.ts`](./apps/forge/src/agents/workspace-skills.ts)

### Capabilities & permissions: `apps/forge/src/capabilities/`

- [`capabilities/catalog.test.ts`](./apps/forge/src/capabilities/catalog.test.ts)
- [`capabilities/catalog.ts`](./apps/forge/src/capabilities/catalog.ts)
- [`capabilities/runtime.test.ts`](./apps/forge/src/capabilities/runtime.test.ts)
- [`capabilities/runtime.ts`](./apps/forge/src/capabilities/runtime.ts)
- [`capabilities/store.test.ts`](./apps/forge/src/capabilities/store.test.ts)
- [`capabilities/store.ts`](./apps/forge/src/capabilities/store.ts)
- [`capabilities/tools.test.ts`](./apps/forge/src/capabilities/tools.test.ts)
- [`capabilities/tools.ts`](./apps/forge/src/capabilities/tools.ts)

### Communication & providers: `apps/forge/src/communication/`

- [`communication/internal-chat-connection.test.ts`](./apps/forge/src/communication/internal-chat-connection.test.ts)
- [`communication/internal-chat-connection.ts`](./apps/forge/src/communication/internal-chat-connection.ts)
- [`communication/internal-chat-errors.ts`](./apps/forge/src/communication/internal-chat-errors.ts)
- [`communication/internal-chat-groups.ts`](./apps/forge/src/communication/internal-chat-groups.ts)
- [`communication/internal-chat-helpers.test.ts`](./apps/forge/src/communication/internal-chat-helpers.test.ts)
- [`communication/internal-chat-helpers.ts`](./apps/forge/src/communication/internal-chat-helpers.ts)
- [`communication/internal-chat-provider.test.ts`](./apps/forge/src/communication/internal-chat-provider.test.ts)
- [`communication/internal-chat-provider.ts`](./apps/forge/src/communication/internal-chat-provider.ts)
- [`communication/internal-chat-service.test.ts`](./apps/forge/src/communication/internal-chat-service.test.ts)
- [`communication/internal-chat-service.ts`](./apps/forge/src/communication/internal-chat-service.ts)
- [`communication/internal-chat-tools.test.ts`](./apps/forge/src/communication/internal-chat-tools.test.ts)
- [`communication/internal-chat-tools.ts`](./apps/forge/src/communication/internal-chat-tools.ts)
- [`communication/provider-loader.test.ts`](./apps/forge/src/communication/provider-loader.test.ts)
- [`communication/provider-loader.ts`](./apps/forge/src/communication/provider-loader.ts)

### Coolify: `apps/forge/src/coolify/`

- [`coolify/__tests__/schemas.test.ts`](./apps/forge/src/coolify/__tests__/schemas.test.ts)
- [`coolify/manager.test.ts`](./apps/forge/src/coolify/manager.test.ts)
- [`coolify/manager.ts`](./apps/forge/src/coolify/manager.ts)
- [`coolify/tools.test.ts`](./apps/forge/src/coolify/tools.test.ts)
- [`coolify/tools.ts`](./apps/forge/src/coolify/tools.ts)

### Database & encryption: `apps/forge/src/database/`

- [`database/__tests__/schema.test.ts`](./apps/forge/src/database/__tests__/schema.test.ts)
- [`database/client.ts`](./apps/forge/src/database/client.ts)
- [`database/config.ts`](./apps/forge/src/database/config.ts)
- [`database/index.ts`](./apps/forge/src/database/index.ts)
- [`database/migrate.ts`](./apps/forge/src/database/migrate.ts)
- [`database/schema.test.ts`](./apps/forge/src/database/schema.test.ts)
- [`database/schema.ts`](./apps/forge/src/database/schema.ts)

### Root: `apps/forge/src/_root/`

- [`discord-account.test.ts`](./apps/forge/src/discord-account.test.ts)
- [`discord-account.ts`](./apps/forge/src/discord-account.ts)
- [`discord-types.test.ts`](./apps/forge/src/discord-types.test.ts)
- [`discord-types.ts`](./apps/forge/src/discord-types.ts)
- [`email-account.test.ts`](./apps/forge/src/email-account.test.ts)
- [`email-account.ts`](./apps/forge/src/email-account.ts)
- [`hiring-rh.test.ts`](./apps/forge/src/hiring-rh.test.ts)
- [`main.ts`](./apps/forge/src/main.ts)

### Email: `apps/forge/src/email/`

- [`email/migadu-manager.test.ts`](./apps/forge/src/email/migadu-manager.test.ts)
- [`email/migadu-manager.ts`](./apps/forge/src/email/migadu-manager.ts)

### encryption: `apps/forge/src/encryption/`

- [`encryption/crypto.test.ts`](./apps/forge/src/encryption/crypto.test.ts)
- [`encryption/crypto.ts`](./apps/forge/src/encryption/crypto.ts)

### finance: `apps/forge/src/finance/`

- [`finance/company-cash-ledger.test.ts`](./apps/forge/src/finance/company-cash-ledger.test.ts)
- [`finance/company-cash-ledger.ts`](./apps/forge/src/finance/company-cash-ledger.ts)
- [`finance/company-cash-operations.test.ts`](./apps/forge/src/finance/company-cash-operations.test.ts)
- [`finance/company-cash-operations.ts`](./apps/forge/src/finance/company-cash-operations.ts)
- [`finance/company-payables.test.ts`](./apps/forge/src/finance/company-payables.test.ts)
- [`finance/company-payables.ts`](./apps/forge/src/finance/company-payables.ts)

### GitHub: `apps/forge/src/github/`

- [`github/__tests__/assignees.test.ts`](./apps/forge/src/github/__tests__/assignees.test.ts)
- [`github/__tests__/helpers.test.ts`](./apps/forge/src/github/__tests__/helpers.test.ts)
- [`github/helpers.test.ts`](./apps/forge/src/github/helpers.test.ts)
- [`github/helpers.ts`](./apps/forge/src/github/helpers.ts)
- [`github/manager.test.ts`](./apps/forge/src/github/manager.test.ts)
- [`github/manager.ts`](./apps/forge/src/github/manager.ts)
- [`github/tools.test.ts`](./apps/forge/src/github/tools.test.ts)
- [`github/tools.ts`](./apps/forge/src/github/tools.ts)
- [`github/types.test.ts`](./apps/forge/src/github/types.test.ts)
- [`github/types.ts`](./apps/forge/src/github/types.ts)

### http: `apps/forge/src/http/`

- [`http/server.ts`](./apps/forge/src/http/server.ts)

### llm: `apps/forge/src/llm/`

- [`llm/model-price-store.test.ts`](./apps/forge/src/llm/model-price-store.test.ts)
- [`llm/model-price-store.ts`](./apps/forge/src/llm/model-price-store.ts)
- [`llm/runtime-model.ts`](./apps/forge/src/llm/runtime-model.ts)
- [`llm/settings-store.test.ts`](./apps/forge/src/llm/settings-store.test.ts)
- [`llm/settings-store.ts`](./apps/forge/src/llm/settings-store.ts)

### micro-erp: `apps/forge/src/micro-erp/`

- [`micro-erp/read-model.test.ts`](./apps/forge/src/micro-erp/read-model.test.ts)
- [`micro-erp/read-model.ts`](./apps/forge/src/micro-erp/read-model.ts)
- [`micro-erp/tools.ts`](./apps/forge/src/micro-erp/tools.ts)

### minimax: `apps/forge/src/minimax/`

- [`minimax/index.ts`](./apps/forge/src/minimax/index.ts)
- [`minimax/manager.test.ts`](./apps/forge/src/minimax/manager.test.ts)
- [`minimax/manager.ts`](./apps/forge/src/minimax/manager.ts)
- [`minimax/tools.test.ts`](./apps/forge/src/minimax/tools.test.ts)
- [`minimax/tools.ts`](./apps/forge/src/minimax/tools.ts)

### Notifications: `apps/forge/src/notifications/`

- [`notifications/store.test.ts`](./apps/forge/src/notifications/store.test.ts)
- [`notifications/store.ts`](./apps/forge/src/notifications/store.ts)
- [`notifications/tools.test.ts`](./apps/forge/src/notifications/tools.test.ts)
- [`notifications/tools.ts`](./apps/forge/src/notifications/tools.ts)

### Schedules: `apps/forge/src/schedules/`

- [`schedules/manager.test.ts`](./apps/forge/src/schedules/manager.test.ts)
- [`schedules/manager.ts`](./apps/forge/src/schedules/manager.ts)
- [`schedules/schedule-helpers.test.ts`](./apps/forge/src/schedules/schedule-helpers.test.ts)
- [`schedules/schedule-helpers.ts`](./apps/forge/src/schedules/schedule-helpers.ts)
- [`schedules/store.ts`](./apps/forge/src/schedules/store.ts)
- [`schedules/tools.test.ts`](./apps/forge/src/schedules/tools.test.ts)
- [`schedules/tools.ts`](./apps/forge/src/schedules/tools.ts)

### scripts: `apps/forge/src/scripts/`

- [`scripts/fund-company-cash.ts`](./apps/forge/src/scripts/fund-company-cash.ts)
- [`scripts/init-agent-registry.ts`](./apps/forge/src/scripts/init-agent-registry.ts)
- [`scripts/reset-agent-embedder-indexes.ts`](./apps/forge/src/scripts/reset-agent-embedder-indexes.ts)
- [`scripts/top-up-agent-contract.ts`](./apps/forge/src/scripts/top-up-agent-contract.ts)

### shared: `apps/forge/src/shared/`

- [`shared/constants.test.ts`](./apps/forge/src/shared/constants.test.ts)
- [`shared/constants.ts`](./apps/forge/src/shared/constants.ts)

### system-integrations: `apps/forge/src/system-integrations/`

- [`system-integrations/store.test.ts`](./apps/forge/src/system-integrations/store.test.ts)
- [`system-integrations/store.ts`](./apps/forge/src/system-integrations/store.ts)

### system-settings: `apps/forge/src/system-settings/`

- [`system-settings/store.ts`](./apps/forge/src/system-settings/store.ts)

### utils: `apps/forge/src/utils/`

- [`utils/__tests__/id.test.ts`](./apps/forge/src/utils/__tests__/id.test.ts)
- [`utils/id.test.ts`](./apps/forge/src/utils/id.test.ts)
- [`utils/id.ts`](./apps/forge/src/utils/id.ts)

## Admin UI: `apps/forge-admin/src`

### components: `apps/forge-admin/src/components/`

- [`components/admin/index.ts`](./apps/forge-admin/src/components/admin/index.ts)
- [`components/admin/pages/roles-page.helpers.ts`](./apps/forge-admin/src/components/admin/pages/roles-page.helpers.ts)

### hooks: `apps/forge-admin/src/hooks/`

- [`hooks/use-mobile.ts`](./apps/forge-admin/src/hooks/use-mobile.ts)

### Admin lib: `apps/forge-admin/src/lib/`

- [`lib/admin-api.ts`](./apps/forge-admin/src/lib/admin-api.ts)
- [`lib/admin-api/agent-types.ts`](./apps/forge-admin/src/lib/admin-api/agent-types.ts)
- [`lib/admin-api/agents.ts`](./apps/forge-admin/src/lib/admin-api/agents.ts)
- [`lib/admin-api/core.test.ts`](./apps/forge-admin/src/lib/admin-api/core.test.ts)
- [`lib/admin-api/core.ts`](./apps/forge-admin/src/lib/admin-api/core.ts)
- [`lib/admin-api/finance-types.ts`](./apps/forge-admin/src/lib/admin-api/finance-types.ts)
- [`lib/admin-api/finance.ts`](./apps/forge-admin/src/lib/admin-api/finance.ts)
- [`lib/admin-api/index.ts`](./apps/forge-admin/src/lib/admin-api/index.ts)
- [`lib/admin-api/internal-chat-types.ts`](./apps/forge-admin/src/lib/admin-api/internal-chat-types.ts)
- [`lib/admin-api/internal-chat.ts`](./apps/forge-admin/src/lib/admin-api/internal-chat.ts)
- [`lib/admin-api/role-types.ts`](./apps/forge-admin/src/lib/admin-api/role-types.ts)
- [`lib/admin-api/roles.ts`](./apps/forge-admin/src/lib/admin-api/roles.ts)
- [`lib/admin-api/system-types.ts`](./apps/forge-admin/src/lib/admin-api/system-types.ts)
- [`lib/admin-api/system.ts`](./apps/forge-admin/src/lib/admin-api/system.ts)
- [`lib/admin-api/types.ts`](./apps/forge-admin/src/lib/admin-api/types.ts)
- [`lib/admin-secret.ts`](./apps/forge-admin/src/lib/admin-secret.ts)
- [`lib/admin-theme.ts`](./apps/forge-admin/src/lib/admin-theme.ts)
- [`lib/admin-toast.ts`](./apps/forge-admin/src/lib/admin-toast.ts)
- [`lib/utils.ts`](./apps/forge-admin/src/lib/utils.ts)

### Root: `apps/forge-admin/src/_root/`

- [`routeTree.gen.ts`](./apps/forge-admin/src/routeTree.gen.ts)

### routes: `apps/forge-admin/src/routes/`

- [`routes/agents/$agentId/-agent-detail-helpers.ts`](./apps/forge-admin/src/routes/agents/$agentId/-agent-detail-helpers.ts)
- [`routes/agents/$agentId/contract/-contract-format.ts`](./apps/forge-admin/src/routes/agents/$agentId/contract/-contract-format.ts)
- [`routes/agents/$agentId/providers/$providerType/-provider-credentials.ts`](./apps/forge-admin/src/routes/agents/$agentId/providers/$providerType/-provider-credentials.ts)
- [`routes/agents/$agentId/schedules/-schedule-helpers.ts`](./apps/forge-admin/src/routes/agents/$agentId/schedules/-schedule-helpers.ts)
- [`routes/finance/accounts/-finance-accounts-format.ts`](./apps/forge-admin/src/routes/finance/accounts/-finance-accounts-format.ts)
- [`routes/finance/accounts/-finance-accounts-types.ts`](./apps/forge-admin/src/routes/finance/accounts/-finance-accounts-types.ts)
- [`routes/home/conversations/-route-helpers.ts`](./apps/forge-admin/src/routes/home/conversations/-route-helpers.ts)

## Agent runtime core: `packages/agent-runtime-core/src`

### core: `packages/agent-runtime-core/src/core/`

- [`core/action-execution.ts`](./packages/agent-runtime-core/src/core/action-execution.ts)
- [`core/actions.ts`](./packages/agent-runtime-core/src/core/actions.ts)
- [`core/async-event-channel.ts`](./packages/agent-runtime-core/src/core/async-event-channel.ts)
- [`core/context-formatters.ts`](./packages/agent-runtime-core/src/core/context-formatters.ts)
- [`core/continuation.ts`](./packages/agent-runtime-core/src/core/continuation.ts)
- [`core/input-batching.ts`](./packages/agent-runtime-core/src/core/input-batching.ts)
- [`core/model.ts`](./packages/agent-runtime-core/src/core/model.ts)
- [`core/observers.ts`](./packages/agent-runtime-core/src/core/observers.ts)
- [`core/plugins.ts`](./packages/agent-runtime-core/src/core/plugins.ts)
- [`core/runtime-events.ts`](./packages/agent-runtime-core/src/core/runtime-events.ts)
- [`core/runtime.ts`](./packages/agent-runtime-core/src/core/runtime.ts)
- [`core/snapshot-schema.ts`](./packages/agent-runtime-core/src/core/snapshot-schema.ts)
- [`core/step-context.ts`](./packages/agent-runtime-core/src/core/step-context.ts)
- [`core/step-output.ts`](./packages/agent-runtime-core/src/core/step-output.ts)
- [`core/types.ts`](./packages/agent-runtime-core/src/core/types.ts)

### integrations: `packages/agent-runtime-core/src/integrations/`

- [`integrations/adapters/ai-sdk.ts`](./packages/agent-runtime-core/src/integrations/adapters/ai-sdk.ts)
- [`integrations/adapters/fallback-model.ts`](./packages/agent-runtime-core/src/integrations/adapters/fallback-model.ts)
- [`integrations/adapters/hooked-model.ts`](./packages/agent-runtime-core/src/integrations/adapters/hooked-model.ts)
- [`integrations/adapters/model-middleware.ts`](./packages/agent-runtime-core/src/integrations/adapters/model-middleware.ts)
- [`integrations/adapters/retrying-model.ts`](./packages/agent-runtime-core/src/integrations/adapters/retrying-model.ts)
- [`integrations/adapters/timeout-model.ts`](./packages/agent-runtime-core/src/integrations/adapters/timeout-model.ts)
- [`integrations/assets/blob-store.ts`](./packages/agent-runtime-core/src/integrations/assets/blob-store.ts)
- [`integrations/assets/in-memory-blob-store.ts`](./packages/agent-runtime-core/src/integrations/assets/in-memory-blob-store.ts)
- [`integrations/conversations/context-entries.ts`](./packages/agent-runtime-core/src/integrations/conversations/context-entries.ts)
- [`integrations/conversations/contracts.ts`](./packages/agent-runtime-core/src/integrations/conversations/contracts.ts)
- [`integrations/conversations/filesystem-conversation-store.ts`](./packages/agent-runtime-core/src/integrations/conversations/filesystem-conversation-store.ts)
- [`integrations/conversations/history-plugin.ts`](./packages/agent-runtime-core/src/integrations/conversations/history-plugin.ts)
- [`integrations/conversations/in-memory-conversation-store.ts`](./packages/agent-runtime-core/src/integrations/conversations/in-memory-conversation-store.ts)
- [`integrations/conversations/runtime-bridge.ts`](./packages/agent-runtime-core/src/integrations/conversations/runtime-bridge.ts)
- [`integrations/conversations/runtime-input.ts`](./packages/agent-runtime-core/src/integrations/conversations/runtime-input.ts)
- [`integrations/conversations/runtime-observer.ts`](./packages/agent-runtime-core/src/integrations/conversations/runtime-observer.ts)
- [`integrations/dispatch/runtime-dispatch-bus.ts`](./packages/agent-runtime-core/src/integrations/dispatch/runtime-dispatch-bus.ts)
- [`integrations/embedding/contracts.ts`](./packages/agent-runtime-core/src/integrations/embedding/contracts.ts)
- [`integrations/extensions/context-notes.ts`](./packages/agent-runtime-core/src/integrations/extensions/context-notes.ts)
- [`integrations/extensions/in-memory-recall.ts`](./packages/agent-runtime-core/src/integrations/extensions/in-memory-recall.ts)
- [`integrations/extensions/journal-history.ts`](./packages/agent-runtime-core/src/integrations/extensions/journal-history.ts)
- [`integrations/extensions/journal-input-history.ts`](./packages/agent-runtime-core/src/integrations/extensions/journal-input-history.ts)
- [`integrations/extensions/long-term-recall.ts`](./packages/agent-runtime-core/src/integrations/extensions/long-term-recall.ts)
- [`integrations/extensions/operational-memory-conversation-plugin.ts`](./packages/agent-runtime-core/src/integrations/extensions/operational-memory-conversation-plugin.ts)
- [`integrations/extensions/operational-memory.ts`](./packages/agent-runtime-core/src/integrations/extensions/operational-memory.ts)
- [`integrations/extensions/recent-inputs.ts`](./packages/agent-runtime-core/src/integrations/extensions/recent-inputs.ts)
- [`integrations/extensions/recent-steps.ts`](./packages/agent-runtime-core/src/integrations/extensions/recent-steps.ts)
- [`integrations/extensions/runtime-journal.ts`](./packages/agent-runtime-core/src/integrations/extensions/runtime-journal.ts)
- [`integrations/extensions/runtime-snapshot-observer.ts`](./packages/agent-runtime-core/src/integrations/extensions/runtime-snapshot-observer.ts)
- [`integrations/extensions/skill-context.ts`](./packages/agent-runtime-core/src/integrations/extensions/skill-context.ts)
- [`integrations/extensions/static-context.ts`](./packages/agent-runtime-core/src/integrations/extensions/static-context.ts)
- [`integrations/extensions/usage-meter.ts`](./packages/agent-runtime-core/src/integrations/extensions/usage-meter.ts)
- [`integrations/gateways/ai-sdk-vision.ts`](./packages/agent-runtime-core/src/integrations/gateways/ai-sdk-vision.ts)
- [`integrations/gateways/avatar-recording.ts`](./packages/agent-runtime-core/src/integrations/gateways/avatar-recording.ts)
- [`integrations/gateways/avatar.ts`](./packages/agent-runtime-core/src/integrations/gateways/avatar.ts)
- [`integrations/gateways/browser-recording.ts`](./packages/agent-runtime-core/src/integrations/gateways/browser-recording.ts)
- [`integrations/gateways/browser.ts`](./packages/agent-runtime-core/src/integrations/gateways/browser.ts)
- [`integrations/gateways/buffered-realtime-speech.ts`](./packages/agent-runtime-core/src/integrations/gateways/buffered-realtime-speech.ts)
- [`integrations/gateways/buffered-realtime-tts.ts`](./packages/agent-runtime-core/src/integrations/gateways/buffered-realtime-tts.ts)
- [`integrations/gateways/buffered-streaming-tts.ts`](./packages/agent-runtime-core/src/integrations/gateways/buffered-streaming-tts.ts)
- [`integrations/gateways/configured-browser-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/configured-browser-gateway.ts)
- [`integrations/gateways/configured-image-generation-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/configured-image-generation-gateway.ts)
- [`integrations/gateways/configured-provider-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/configured-provider-gateway.ts)
- [`integrations/gateways/configured-speech-gateways.ts`](./packages/agent-runtime-core/src/integrations/gateways/configured-speech-gateways.ts)
- [`integrations/gateways/configured-vision-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/configured-vision-gateway.ts)
- [`integrations/gateways/configured-workspace-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/configured-workspace-gateway.ts)
- [`integrations/gateways/fallback-provider-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/fallback-provider-gateway.ts)
- [`integrations/gateways/image-generation.ts`](./packages/agent-runtime-core/src/integrations/gateways/image-generation.ts)
- [`integrations/gateways/in-memory-provider-gateway.ts`](./packages/agent-runtime-core/src/integrations/gateways/in-memory-provider-gateway.ts)
- [`integrations/gateways/local-bash-workspace.ts`](./packages/agent-runtime-core/src/integrations/gateways/local-bash-workspace.ts)
- [`integrations/gateways/local-workspace-filesystem.ts`](./packages/agent-runtime-core/src/integrations/gateways/local-workspace-filesystem.ts)
- [`integrations/gateways/persisting-image-generation.ts`](./packages/agent-runtime-core/src/integrations/gateways/persisting-image-generation.ts)
- [`integrations/gateways/persisting-stt.ts`](./packages/agent-runtime-core/src/integrations/gateways/persisting-stt.ts)
- [`integrations/gateways/persisting-tts.ts`](./packages/agent-runtime-core/src/integrations/gateways/persisting-tts.ts)
- [`integrations/gateways/persisting-vision.ts`](./packages/agent-runtime-core/src/integrations/gateways/persisting-vision.ts)
- [`integrations/gateways/playwright-browser.ts`](./packages/agent-runtime-core/src/integrations/gateways/playwright-browser.ts)
- [`integrations/gateways/providers.ts`](./packages/agent-runtime-core/src/integrations/gateways/providers.ts)
- [`integrations/gateways/speech-recording.ts`](./packages/agent-runtime-core/src/integrations/gateways/speech-recording.ts)
- [`integrations/gateways/speech.ts`](./packages/agent-runtime-core/src/integrations/gateways/speech.ts)
- [`integrations/gateways/vision.ts`](./packages/agent-runtime-core/src/integrations/gateways/vision.ts)
- [`integrations/gateways/workspace-actions.ts`](./packages/agent-runtime-core/src/integrations/gateways/workspace-actions.ts)
- [`integrations/gateways/workspace-recording.ts`](./packages/agent-runtime-core/src/integrations/gateways/workspace-recording.ts)
- [`integrations/gateways/workspace.ts`](./packages/agent-runtime-core/src/integrations/gateways/workspace.ts)
- [`integrations/hosts/runtime-host.ts`](./packages/agent-runtime-core/src/integrations/hosts/runtime-host.ts)
- [`integrations/index.ts`](./packages/agent-runtime-core/src/integrations/index.ts)
- [`integrations/journal/contracts.ts`](./packages/agent-runtime-core/src/integrations/journal/contracts.ts)
- [`integrations/journal/in-memory-runtime-journal.ts`](./packages/agent-runtime-core/src/integrations/journal/in-memory-runtime-journal.ts)
- [`integrations/mcp/contracts.ts`](./packages/agent-runtime-core/src/integrations/mcp/contracts.ts)
- [`integrations/mcp/json-schema.ts`](./packages/agent-runtime-core/src/integrations/mcp/json-schema.ts)
- [`integrations/mcp/runtime-actions.ts`](./packages/agent-runtime-core/src/integrations/mcp/runtime-actions.ts)
- [`integrations/mcp/sdk-mcp-gateway.ts`](./packages/agent-runtime-core/src/integrations/mcp/sdk-mcp-gateway.ts)
- [`integrations/mcp/session-registry.ts`](./packages/agent-runtime-core/src/integrations/mcp/session-registry.ts)
- [`integrations/memory/filesystem-long-term-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/filesystem-long-term-memory.ts)
- [`integrations/memory/filesystem-operational-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/filesystem-operational-memory.ts)
- [`integrations/memory/in-memory-long-term-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/in-memory-long-term-memory.ts)
- [`integrations/memory/in-memory-operational-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/in-memory-operational-memory.ts)
- [`integrations/memory/long-term-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/long-term-memory.ts)
- [`integrations/memory/operational-memory-conversation-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/operational-memory-conversation-memory.ts)
- [`integrations/memory/operational-memory-conversation-state-store.ts`](./packages/agent-runtime-core/src/integrations/memory/operational-memory-conversation-state-store.ts)
- [`integrations/memory/operational-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/operational-memory.ts)
- [`integrations/memory/refreshable-long-term-memory.ts`](./packages/agent-runtime-core/src/integrations/memory/refreshable-long-term-memory.ts)
- [`integrations/persistence/filesystem-blob-store.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-blob-store.ts)
- [`integrations/persistence/filesystem-browser-session-recorder.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-browser-session-recorder.ts)
- [`integrations/persistence/filesystem-context-note-store.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-context-note-store.ts)
- [`integrations/persistence/filesystem-long-term-memory.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-long-term-memory.ts)
- [`integrations/persistence/filesystem-operational-memory-conversation-state-store.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-operational-memory-conversation-state-store.ts)
- [`integrations/persistence/filesystem-runtime-journal.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-runtime-journal.ts)
- [`integrations/persistence/filesystem-runtime-snapshot-store.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-runtime-snapshot-store.ts)
- [`integrations/persistence/filesystem-skill-registry.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-skill-registry.ts)
- [`integrations/persistence/filesystem-speech-synthesis-recorder.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-speech-synthesis-recorder.ts)
- [`integrations/persistence/filesystem-workspace-command-recorder.ts`](./packages/agent-runtime-core/src/integrations/persistence/filesystem-workspace-command-recorder.ts)
- [`integrations/persistence/runtime-snapshot-store.ts`](./packages/agent-runtime-core/src/integrations/persistence/runtime-snapshot-store.ts)
- [`integrations/providers/minimax-image.ts`](./packages/agent-runtime-core/src/integrations/providers/minimax-image.ts)
- [`integrations/providers/minimax-speech.ts`](./packages/agent-runtime-core/src/integrations/providers/minimax-speech.ts)
- [`integrations/providers/minimax-text.ts`](./packages/agent-runtime-core/src/integrations/providers/minimax-text.ts)
- [`integrations/retrieval/contracts.ts`](./packages/agent-runtime-core/src/integrations/retrieval/contracts.ts)
- [`integrations/retrieval/filesystem-document-source.ts`](./packages/agent-runtime-core/src/integrations/retrieval/filesystem-document-source.ts)
- [`integrations/retrieval/in-memory-bm25-index.ts`](./packages/agent-runtime-core/src/integrations/retrieval/in-memory-bm25-index.ts)
- [`integrations/retrieval/in-memory-hybrid-retrieval.ts`](./packages/agent-runtime-core/src/integrations/retrieval/in-memory-hybrid-retrieval.ts)
- [`integrations/retrieval/in-memory-vector-index.ts`](./packages/agent-runtime-core/src/integrations/retrieval/in-memory-vector-index.ts)
- [`integrations/retrieval/refresh-controller.ts`](./packages/agent-runtime-core/src/integrations/retrieval/refresh-controller.ts)
- [`integrations/retrieval/refreshable-retrieval-workspace.ts`](./packages/agent-runtime-core/src/integrations/retrieval/refreshable-retrieval-workspace.ts)
- [`integrations/runtime/multimodal-input.ts`](./packages/agent-runtime-core/src/integrations/runtime/multimodal-input.ts)
- [`integrations/runtime/realtime-speech-runtime-bridge.ts`](./packages/agent-runtime-core/src/integrations/runtime/realtime-speech-runtime-bridge.ts)
- [`integrations/runtime/run-controller.ts`](./packages/agent-runtime-core/src/integrations/runtime/run-controller.ts)
- [`integrations/runtime/runtime-input-bridge.ts`](./packages/agent-runtime-core/src/integrations/runtime/runtime-input-bridge.ts)
- [`integrations/runtime/runtime-message-chunk-stream.ts`](./packages/agent-runtime-core/src/integrations/runtime/runtime-message-chunk-stream.ts)
- [`integrations/runtime/runtime-message-stream.ts`](./packages/agent-runtime-core/src/integrations/runtime/runtime-message-stream.ts)
- [`integrations/runtime/runtime-speech-renderer.ts`](./packages/agent-runtime-core/src/integrations/runtime/runtime-speech-renderer.ts)
- [`integrations/runtime/runtime-streaming-voice-session.ts`](./packages/agent-runtime-core/src/integrations/runtime/runtime-streaming-voice-session.ts)
- [`integrations/runtime/runtime-voice-session.ts`](./packages/agent-runtime-core/src/integrations/runtime/runtime-voice-session.ts)
- [`integrations/scheduler/in-memory-runtime-scheduler.ts`](./packages/agent-runtime-core/src/integrations/scheduler/in-memory-runtime-scheduler.ts)
- [`integrations/scheduler/in-memory-runtime-target-registry.ts`](./packages/agent-runtime-core/src/integrations/scheduler/in-memory-runtime-target-registry.ts)
- [`integrations/scheduler/keyed-runtime-scheduler.ts`](./packages/agent-runtime-core/src/integrations/scheduler/keyed-runtime-scheduler.ts)
- [`integrations/scheduler/runtime-target-registry.ts`](./packages/agent-runtime-core/src/integrations/scheduler/runtime-target-registry.ts)
- [`integrations/skills/contracts.ts`](./packages/agent-runtime-core/src/integrations/skills/contracts.ts)
- [`integrations/skills/filesystem-skill-loader.ts`](./packages/agent-runtime-core/src/integrations/skills/filesystem-skill-loader.ts)
- [`integrations/skills/in-memory-skill-registry.ts`](./packages/agent-runtime-core/src/integrations/skills/in-memory-skill-registry.ts)
- [`integrations/state/context-note-store.ts`](./packages/agent-runtime-core/src/integrations/state/context-note-store.ts)
- [`integrations/testing/fake-model.ts`](./packages/agent-runtime-core/src/integrations/testing/fake-model.ts)
- [`integrations/usage/contracts.ts`](./packages/agent-runtime-core/src/integrations/usage/contracts.ts)
- [`integrations/usage/filesystem-usage-meter.ts`](./packages/agent-runtime-core/src/integrations/usage/filesystem-usage-meter.ts)
- [`integrations/usage/in-memory-usage-meter.ts`](./packages/agent-runtime-core/src/integrations/usage/in-memory-usage-meter.ts)

### examples: `packages/agent-runtime-core/src/examples/`

- [`examples/applications/autonomous-agent.ts`](./packages/agent-runtime-core/src/examples/applications/autonomous-agent.ts)
- [`examples/applications/browser-research.ts`](./packages/agent-runtime-core/src/examples/applications/browser-research.ts)
- [`examples/applications/npc-world.ts`](./packages/agent-runtime-core/src/examples/applications/npc-world.ts)
- [`examples/applications/story-narrator.ts`](./packages/agent-runtime-core/src/examples/applications/story-narrator.ts)
- [`examples/applications/vtuber.ts`](./packages/agent-runtime-core/src/examples/applications/vtuber.ts)
- [`examples/applications/workspace-agent.ts`](./packages/agent-runtime-core/src/examples/applications/workspace-agent.ts)
- [`examples/domain/relationships/in-memory-relationship-store.ts`](./packages/agent-runtime-core/src/examples/domain/relationships/in-memory-relationship-store.ts)
- [`examples/domain/relationships/relationship-store.ts`](./packages/agent-runtime-core/src/examples/domain/relationships/relationship-store.ts)
- [`examples/domain/story/in-memory-story-event-store.ts`](./packages/agent-runtime-core/src/examples/domain/story/in-memory-story-event-store.ts)
- [`examples/domain/story/story-events.ts`](./packages/agent-runtime-core/src/examples/domain/story/story-events.ts)
- [`examples/gateways/filesystem-world.ts`](./packages/agent-runtime-core/src/examples/gateways/filesystem-world.ts)
- [`examples/gateways/in-memory-world.ts`](./packages/agent-runtime-core/src/examples/gateways/in-memory-world.ts)
- [`examples/gateways/world.ts`](./packages/agent-runtime-core/src/examples/gateways/world.ts)
- [`examples/index.ts`](./packages/agent-runtime-core/src/examples/index.ts)
- [`examples/orchestration/avatar-director.ts`](./packages/agent-runtime-core/src/examples/orchestration/avatar-director.ts)
- [`examples/orchestration/multi-agent-scene.ts`](./packages/agent-runtime-core/src/examples/orchestration/multi-agent-scene.ts)
- [`examples/orchestration/realtime-voice-agent.ts`](./packages/agent-runtime-core/src/examples/orchestration/realtime-voice-agent.ts)
- [`examples/persistence/filesystem-relationship-store.ts`](./packages/agent-runtime-core/src/examples/persistence/filesystem-relationship-store.ts)
- [`examples/persistence/filesystem-story-event-store.ts`](./packages/agent-runtime-core/src/examples/persistence/filesystem-story-event-store.ts)

## Forge runtime core: `packages/forge-runtime-core/src`

### agent: `packages/forge-runtime-core/src/agent/`

- [`agent/memory/embedder.ts`](./packages/forge-runtime-core/src/agent/memory/embedder.ts)
- [`agent/wake-queue.test.ts`](./packages/forge-runtime-core/src/agent/wake-queue.test.ts)
- [`agent/wake-queue.ts`](./packages/forge-runtime-core/src/agent/wake-queue.ts)

### agent-config.test.ts: `packages/forge-runtime-core/src/agent-config.test.ts/`

### agent-config.ts: `packages/forge-runtime-core/src/agent-config.ts/`

### anthropic-prompt-cache.test.ts: `packages/forge-runtime-core/src/anthropic-prompt-cache.test.ts/`

### anthropic-prompt-cache.ts: `packages/forge-runtime-core/src/anthropic-prompt-cache.ts/`

### assistant-conversation-persistence-plugin.test.ts: `packages/forge-runtime-core/src/assistant-conversation-persistence-plugin.test.ts/`

### assistant-conversation-persistence-plugin.ts: `packages/forge-runtime-core/src/assistant-conversation-persistence-plugin.ts/`

### claude-max.ts: `packages/forge-runtime-core/src/claude-max.ts/`

### communication-module.ts: `packages/forge-runtime-core/src/communication-module.ts/`

### communication-tools.test.ts: `packages/forge-runtime-core/src/communication-tools.test.ts/`

### communication-tools.ts: `packages/forge-runtime-core/src/communication-tools.ts/`

### communication.test.ts: `packages/forge-runtime-core/src/communication.test.ts/`

### communication.ts: `packages/forge-runtime-core/src/communication.ts/`

### contracts.test.ts: `packages/forge-runtime-core/src/contracts.test.ts/`

### contracts.ts: `packages/forge-runtime-core/src/contracts.ts/`

### conversation-model-messages.test.ts: `packages/forge-runtime-core/src/conversation-model-messages.test.ts/`

### conversation-model-messages.ts: `packages/forge-runtime-core/src/conversation-model-messages.ts/`

### conversation-runtime-context-formatter.test.ts: `packages/forge-runtime-core/src/conversation-runtime-context-formatter.test.ts/`

### conversation-runtime-context-formatter.ts: `packages/forge-runtime-core/src/conversation-runtime-context-formatter.ts/`

### debug.test.ts: `packages/forge-runtime-core/src/debug.test.ts/`

### debug.ts: `packages/forge-runtime-core/src/debug.ts/`

### embedder.test.ts: `packages/forge-runtime-core/src/embedder.test.ts/`

### embedder.ts: `packages/forge-runtime-core/src/embedder.ts/`

### index.test.ts: `packages/forge-runtime-core/src/index.test.ts/`

### index.ts: `packages/forge-runtime-core/src/index.ts/`

### libsql-communication-contacts-store.test.ts: `packages/forge-runtime-core/src/libsql-communication-contacts-store.test.ts/`

### libsql-communication-contacts-store.ts: `packages/forge-runtime-core/src/libsql-communication-contacts-store.ts/`

### libsql-conversation-store.test.ts: `packages/forge-runtime-core/src/libsql-conversation-store.test.ts/`

### libsql-conversation-store.ts: `packages/forge-runtime-core/src/libsql-conversation-store.ts/`

### llm: `packages/forge-runtime-core/src/llm/`

- [`llm/auth/anthropic.test.ts`](./packages/forge-runtime-core/src/llm/auth/anthropic.test.ts)
- [`llm/auth/anthropic.ts`](./packages/forge-runtime-core/src/llm/auth/anthropic.ts)
- [`llm/auth/openai-codex.ts`](./packages/forge-runtime-core/src/llm/auth/openai-codex.ts)
- [`llm/auth/store.test.ts`](./packages/forge-runtime-core/src/llm/auth/store.test.ts)
- [`llm/auth/store.ts`](./packages/forge-runtime-core/src/llm/auth/store.ts)
- [`llm/claude-max.ts`](./packages/forge-runtime-core/src/llm/claude-max.ts)
- [`llm/model-ids.test.ts`](./packages/forge-runtime-core/src/llm/model-ids.test.ts)
- [`llm/model-ids.ts`](./packages/forge-runtime-core/src/llm/model-ids.ts)
- [`llm/openai-codex.ts`](./packages/forge-runtime-core/src/llm/openai-codex.ts)

### logger.test.ts: `packages/forge-runtime-core/src/logger.test.ts/`

### logger.ts: `packages/forge-runtime-core/src/logger.ts/`

### mcp.test.ts: `packages/forge-runtime-core/src/mcp.test.ts/`

### mcp.ts: `packages/forge-runtime-core/src/mcp.ts/`

### memory.test.ts: `packages/forge-runtime-core/src/memory.test.ts/`

### memory.ts: `packages/forge-runtime-core/src/memory.ts/`

### model-ids.test.ts: `packages/forge-runtime-core/src/model-ids.test.ts/`

### model-ids.ts: `packages/forge-runtime-core/src/model-ids.ts/`

### native-tool-loop.test.ts: `packages/forge-runtime-core/src/native-tool-loop.test.ts/`

### native-tool-loop.ts: `packages/forge-runtime-core/src/native-tool-loop.ts/`

### oauth-anthropic.ts: `packages/forge-runtime-core/src/oauth-anthropic.ts/`

### oauth-gateway.test.ts: `packages/forge-runtime-core/src/oauth-gateway.test.ts/`

### oauth-gateway.ts: `packages/forge-runtime-core/src/oauth-gateway.ts/`

### oauth-openai-codex.ts: `packages/forge-runtime-core/src/oauth-openai-codex.ts/`

### oauth-store.ts: `packages/forge-runtime-core/src/oauth-store.ts/`

### openai-codex.ts: `packages/forge-runtime-core/src/openai-codex.ts/`

### operational-memory-conversation-observer.test.ts: `packages/forge-runtime-core/src/operational-memory-conversation-observer.test.ts/`

### operational-memory-conversation-observer.ts: `packages/forge-runtime-core/src/operational-memory-conversation-observer.ts/`

### operational-memory-om-rendering.test.ts: `packages/forge-runtime-core/src/operational-memory-om-rendering.test.ts/`

### operational-memory-om-rendering.ts: `packages/forge-runtime-core/src/operational-memory-om-rendering.ts/`

### operational-memory-om.ts: `packages/forge-runtime-core/src/operational-memory-om.ts/`

### operational-memory-prompting.test.ts: `packages/forge-runtime-core/src/operational-memory-prompting.test.ts/`

### operational-memory-prompting.ts: `packages/forge-runtime-core/src/operational-memory-prompting.ts/`

### operational-memory-state.test.ts: `packages/forge-runtime-core/src/operational-memory-state.test.ts/`

### operational-memory-state.ts: `packages/forge-runtime-core/src/operational-memory-state.ts/`

### runtime-agent-session-generate.ts: `packages/forge-runtime-core/src/runtime-agent-session-generate.ts/`

### runtime-agent-session-iteration.test.ts: `packages/forge-runtime-core/src/runtime-agent-session-iteration.test.ts/`

### runtime-agent-session-iteration.ts: `packages/forge-runtime-core/src/runtime-agent-session-iteration.ts/`

### runtime-agent-session-messages.test.ts: `packages/forge-runtime-core/src/runtime-agent-session-messages.test.ts/`

### runtime-agent-session-messages.ts: `packages/forge-runtime-core/src/runtime-agent-session-messages.ts/`

### runtime-agent-session-runtime.test.ts: `packages/forge-runtime-core/src/runtime-agent-session-runtime.test.ts/`

### runtime-agent-session-runtime.ts: `packages/forge-runtime-core/src/runtime-agent-session-runtime.ts/`

### runtime-agent-session.test.ts: `packages/forge-runtime-core/src/runtime-agent-session.test.ts/`

### runtime-agent-session.ts: `packages/forge-runtime-core/src/runtime-agent-session.ts/`

### runtime-working-memory.test.ts: `packages/forge-runtime-core/src/runtime-working-memory.test.ts/`

### runtime-working-memory.ts: `packages/forge-runtime-core/src/runtime-working-memory.ts/`

### runtime.test.ts: `packages/forge-runtime-core/src/runtime.test.ts/`

### runtime.ts: `packages/forge-runtime-core/src/runtime.ts/`

### safe-identifier.test.ts: `packages/forge-runtime-core/src/safe-identifier.test.ts/`

### safe-identifier.ts: `packages/forge-runtime-core/src/safe-identifier.ts/`

### sqlite-workspace-retrieval.test.ts: `packages/forge-runtime-core/src/sqlite-workspace-retrieval.test.ts/`

### sqlite-workspace-retrieval.ts: `packages/forge-runtime-core/src/sqlite-workspace-retrieval.ts/`

### tool-output-truncation.test.ts: `packages/forge-runtime-core/src/tool-output-truncation.test.ts/`

### tool-output-truncation.ts: `packages/forge-runtime-core/src/tool-output-truncation.ts/`

### tools.test.ts: `packages/forge-runtime-core/src/tools.test.ts/`

### tools.ts: `packages/forge-runtime-core/src/tools.ts/`

### usage.test.ts: `packages/forge-runtime-core/src/usage.test.ts/`

### usage.ts: `packages/forge-runtime-core/src/usage.ts/`

### wake-queue.ts: `packages/forge-runtime-core/src/wake-queue.ts/`

### working-memory.test.ts: `packages/forge-runtime-core/src/working-memory.test.ts/`

### working-memory.ts: `packages/forge-runtime-core/src/working-memory.ts/`
