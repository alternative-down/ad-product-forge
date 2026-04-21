import type { RuntimeActionDefinition } from '../../core/actions.js';

import type { McpGateway, McpRuntimeActionOptions, McpSession, McpTransport } from './contracts.js';
import { createMcpActionDefinitions } from './runtime-actions.js';

type CachedMcpSession = {
  transportFingerprint: string;
  session: McpSession;
  actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> | null;
};

export type McpSessionRegistryOptions = {
  gateway: McpGateway;
};

export class McpSessionRegistry {
  private readonly gateway: McpGateway;
  private readonly sessions = new Map<string, CachedMcpSession>();

  constructor(options: McpSessionRegistryOptions) {
    this.gateway = options.gateway;
  }

  async getSession(key: string, transport: McpTransport): Promise<McpSession> {
    const fingerprint = fingerprintTransport(transport);
    const cached = this.sessions.get(key);

    if (cached && cached.transportFingerprint === fingerprint) {
      return cached.session;
    }

    if (cached) {
      await cached.session.close();
    }

    const session = await this.gateway.createSession(transport);

    this.sessions.set(key, {
      transportFingerprint: fingerprint,
      session,
      actions: null,
    });

    return session;
  }

  async getActionDefinitions(
    key: string,
    transport: McpTransport,
    options?: McpRuntimeActionOptions,
  ): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>> {
    const session = await this.getSession(key, transport);
    const cached = this.sessions.get(key);

    if (!cached) {
      throw new Error(`MCP session cache is missing for key ${key}`);
    }

    if (!cached.actions) {
      cached.actions = await createMcpActionDefinitions(session, options);
    }

    return cached.actions;
  }

  async disposeSession(key: string): Promise<void> {
    const cached = this.sessions.get(key);

    if (!cached) {
      return;
    }

    this.sessions.delete(key);
    await cached.session.close();
  }

  async disposeAll(): Promise<void> {
    const sessions = Array.from(this.sessions.entries());

    this.sessions.clear();

    await Promise.all(sessions.map(([, cached]) => cached.session.close()));
  }
}

function fingerprintTransport(transport: McpTransport) {
  if (transport.type === 'stdio') {
    return JSON.stringify({
      type: transport.type,
      command: transport.command,
      args: transport.args ?? [],
      env: transport.env ?? {},
    });
  }

  return JSON.stringify({
    type: transport.type,
    url: transport.url,
    headers: transport.headers ?? {},
  });
}
