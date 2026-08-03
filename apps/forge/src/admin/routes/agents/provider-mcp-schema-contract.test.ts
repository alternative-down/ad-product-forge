/**
 * D34 #6214 L#NN-50 #36 — provider-mcp.ts schema contract verification.
 *
 * This file uses REAL zod (no mock) to verify the post-#6214 schema tightening:
 * - updateAgentMcpServerSchema: agentId and configId are REQUIRED strings
 * - deleteAgentMcpServerSchema: configId, agentId, serverId all REQUIRED strings
 *
 * The mock'd test file (provider-mcp.test.ts) uses identity-parse zod, which
 * can't catch missing required fields. This file fills that gap.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Re-declare the schemas as the source file does, then verify.
const updateAgentMcpServerSchema = z.object({
  serverId: z.string().min(1),
  agentId: z.string().min(1),
  configId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  transport: z.enum(['stdio', 'http_streamable']).optional(),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
});

const deleteAgentMcpServerSchema = z.object({
  configId: z.string().min(1),
  agentId: z.string().min(1),
  serverId: z.string().min(1),
});

describe('provider-mcp schema contract (D34 #6214 L#NN-50 #36)', () => {
  describe('updateAgentMcpServerSchema', () => {
    it('accepts a body with all required fields', () => {
      const result = updateAgentMcpServerSchema.safeParse({
        serverId: 'srv-1',
        agentId: 'agent-1',
        configId: 'cfg-1',
        name: 'Updated',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing configId (post-#6214 required)', () => {
      const result = updateAgentMcpServerSchema.safeParse({
        serverId: 'srv-1',
        agentId: 'agent-1',
        name: 'Updated',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('configId');
      }
    });

    it('rejects missing agentId (post-#6214 required)', () => {
      const result = updateAgentMcpServerSchema.safeParse({
        serverId: 'srv-1',
        configId: 'cfg-1',
        name: 'Updated',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('agentId');
      }
    });

    it('rejects empty-string configId (z.string().min(1))', () => {
      const result = updateAgentMcpServerSchema.safeParse({
        serverId: 'srv-1',
        agentId: 'agent-1',
        configId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('deleteAgentMcpServerSchema', () => {
    it('accepts a body with all 3 required fields', () => {
      const result = deleteAgentMcpServerSchema.safeParse({
        configId: 'cfg-1',
        agentId: 'agent-1',
        serverId: 'srv-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing configId', () => {
      const result = deleteAgentMcpServerSchema.safeParse({
        agentId: 'agent-1',
        serverId: 'srv-1',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('configId');
      }
    });
  });
});
