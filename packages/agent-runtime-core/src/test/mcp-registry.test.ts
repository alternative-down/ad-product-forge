import { describe, expect, it } from 'vitest';

import { McpSessionRegistry } from '../integrations/mcp/session-registry.js';

describe('McpSessionRegistry', () => {
  it('reuses cached sessions and action definitions for the same transport', async () => {
    const createdSessions: Array<{ closed: boolean }> = [];
    const gateway = {
      async createSession() {
        const session = {
          closed: false,
          async listTools() {
            return [{
              name: 'search',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            }];
          },
          async callTool() {
            return { ok: true };
          },
          async close() {
            session.closed = true;
          },
        };

        createdSessions.push(session);
        return session;
      },
    };
    const registry = new McpSessionRegistry({ gateway });
    const transport = {
      type: 'stdio' as const,
      command: 'echo',
    };

    const firstSession = await registry.getSession('agent-1', transport);
    const secondSession = await registry.getSession('agent-1', transport);
    const firstActions = await registry.getActionDefinitions('agent-1', transport);
    const secondActions = await registry.getActionDefinitions('agent-1', transport);

    expect(firstSession).toBe(secondSession);
    expect(firstActions).toBe(secondActions);
    expect(createdSessions).toHaveLength(1);
  });
});
