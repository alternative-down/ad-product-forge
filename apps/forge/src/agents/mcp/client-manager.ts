import {
  ForgeMcpToolset,
  type ForgeMcpServerConfig,
  type RuntimeActionDefinition,
  forgeDebug,
} from '@forge-runtime/core';

import { getAgentMcpServers } from './store';

type AgentMcpRuntimeActionSource = {
  start(): void;
  getActions(): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
  dispose(): Promise<void>;
};

type ManagedMcpServer = {
  fingerprint: string;
  toolset: ForgeMcpToolset | null;
  actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
};

const MCP_RETRY_BASE_DELAY_MS = 5_000;
const MCP_RETRY_MAX_DELAY_MS = 60_000;

export function createAgentMcpRuntimeActionSource(agentId: string): AgentMcpRuntimeActionSource {
  return new AgentMcpRuntimeActionSourceManager(agentId);
}

class AgentMcpRuntimeActionSourceManager implements AgentMcpRuntimeActionSource {
  private readonly agentId: string;
  private readonly servers = new Map<string, ManagedMcpServer>();

  private actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [];
  private refreshPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private disposed = false;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  start() {
    void this.refresh();
  }

  getActions() {
    return Promise.resolve(this.actions);
  }

  async dispose() {
    this.disposed = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const entries = Array.from(this.servers.values());
    this.servers.clear();
    this.actions = [];

    await Promise.all(
      entries.map(async (entry) => {
        await entry.toolset?.dispose();
      }),
    );
  }

  private async refresh() {
    if (this.disposed) {
      return;
    }

    if (this.refreshPromise) {
      return await this.refreshPromise;
    }

    this.refreshPromise = this.refreshNow().finally(() => {
      this.refreshPromise = null;
    });

    return await this.refreshPromise;
  }

  private async refreshNow() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const rawLinkedServers = await getAgentMcpServers(this.agentId);
    const linkedServers = Array.isArray(rawLinkedServers) ? rawLinkedServers : [];
    const nextServerIds = new Set(linkedServers.map(({ server }) => server.id));
    const staleServerIds = Array.from(this.servers.keys()).filter(
      (serverId) => !nextServerIds.has(serverId),
    );

    for (const serverId of staleServerIds) {
      await this.disposeServer(serverId);
    }

    let hasConnectionFailure = false;

    for (const linkedServer of linkedServers) {
      const serverConfig = mapServerConfig(linkedServer.server);
      const fingerprint = fingerprintServerConfig(serverConfig);
      const current = this.servers.get(serverConfig.id);

      if (current && current.fingerprint === fingerprint && current.actions.length > 0) {
        continue;
      }

      try {
        const nextServer = await this.connectServer(serverConfig, fingerprint);
        const previous = this.servers.get(serverConfig.id);

        this.servers.set(serverConfig.id, nextServer);
        await previous?.toolset?.dispose();
      } catch (error) {
        hasConnectionFailure = true;
        forgeDebug({
          scope: 'mcp-client-manager',
          level: 'warn',
          message: 'Failed to refresh server',
          context: { serverName: serverConfig.name, agentId: this.agentId, error },
        });
      }
    }

    this.rebuildActionSnapshot();

    if (hasConnectionFailure) {
      this.scheduleRetry();
      return;
    }

    this.retryAttempt = 0;
  }

  private async connectServer(serverConfig: ForgeMcpServerConfig, fingerprint: string) {
    const toolset = new ForgeMcpToolset({
      servers: [serverConfig],
    });
    const actions = await toolset.createRuntimeActions();

    return {
      fingerprint,
      toolset,
      actions: actions.map((action) => this.wrapAction(serverConfig.id, action)),
    } satisfies ManagedMcpServer;
  }

  private wrapAction(
    serverId: string,
    action: RuntimeActionDefinition<Record<string, unknown>, unknown>,
  ): RuntimeActionDefinition<Record<string, unknown>, unknown> {
    return {
      ...action,
      async execute(
        input: Record<string, unknown>,
        context: { runtimeId: string; stepId: string; stepNumber: number },
      ) {
        try {
          return await action.execute(input, context);
        } catch (error) {
          void (this as any).handleServerDisconnect(serverId, error);
          throw error;
        }
      },
    };
  }

  private async handleServerDisconnect(serverId: string, error: unknown) {
    const server = this.servers.get(serverId);

    if (!server) {
      return;
    }

    forgeDebug({
      scope: 'mcp-client-manager',
      level: 'warn',
      message: 'Server disconnected',
      context: { agentId: this.agentId, error },
    });
    this.servers.set(serverId, {
      ...server,
      toolset: null,
      actions: [],
    });
    this.rebuildActionSnapshot();
    await server.toolset?.dispose();
    this.scheduleRefresh(0);
  }

  private rebuildActionSnapshot() {
    this.actions = Array.from(this.servers.values()).flatMap((server) => server.actions);
  }

  private scheduleRetry() {
    const delayMs = Math.min(
      MCP_RETRY_BASE_DELAY_MS * 2 ** Math.min(this.retryAttempt, 4),
      MCP_RETRY_MAX_DELAY_MS,
    );

    this.retryAttempt += 1;
    this.scheduleRefresh(delayMs);
  }

  private scheduleRefresh(delayMs: number) {
    if (this.disposed) {
      return;
    }

    if (this.retryTimer && delayMs === 0) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.retryTimer) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.refresh();
    }, delayMs);
  }

  private async disposeServer(serverId: string) {
    const existing = this.servers.get(serverId);

    if (!existing) {
      return;
    }

    this.servers.delete(serverId);
    await existing.toolset?.dispose();
  }
}

function mapServerConfig(
  server: Awaited<ReturnType<typeof getAgentMcpServers>>[number]['server'],
): ForgeMcpServerConfig {
  if (server.transport === 'stdio') {
    return {
      id: server.id,
      name: server.name,
      transport: 'stdio',
      command: server.command !== null && server.command !== undefined ? server.command : '',
      args: server.args !== null && server.args !== undefined ? JSON.parse(server.args) : [],
      env:
        server.envVars !== null && server.envVars !== undefined ? JSON.parse(server.envVars) : {},
    };
  }

  return {
    id: server.id,
    name: server.name,
    transport: 'http-stream',
    url: server.url !== null && server.url !== undefined ? server.url : 'http://localhost:3000/mcp',
    headers:
      server.headers !== null && server.headers !== undefined
        ? JSON.parse(server.headers)
        : undefined,
  };
}

function fingerprintServerConfig(server: ForgeMcpServerConfig) {
  return JSON.stringify(server);
}
