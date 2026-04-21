import { type McpRuntimeActionOptions } from 'agent-runtime-core/integrations';

import type { ForgeMcpServerConfig } from './contracts.js';
import { ForgeMcpToolset } from './mcp.js';

export interface ForgeMcpServerStore {
  listServersForAgent(agentId: string): Promise<ForgeMcpServerConfig[]>;
}

export async function createForgeMcpToolsetFromStore(input: {
  agentId: string;
  store: ForgeMcpServerStore;
  runtimeActionOptions?: Omit<McpRuntimeActionOptions, 'session'>;
}) {
  const servers = await input.store.listServersForAgent(input.agentId);

  if (servers.length === 0) {
    return null;
  }

  return new ForgeMcpToolset({
    servers,
    runtimeActionOptions: input.runtimeActionOptions,
  });
}
