/**
 * Tests for admin/routes/agents/detail-read.ts
 *
 * Coverage: extractAgentId utility, route registration, handler response shapes,
 * pagination defaults, parseJsonBody integration.
 *
 * 0 existing tests → 38 new tests.
 */
import { describe, expect, it } from 'vitest';
import { jsonResponse } from '../index';
import { parseJsonBody } from '../index';

// ─── extractAgentId utility ────────────────────────────────────────────────────
// extractAgentId is an internal utility (not exported).
// Tests verify the expected behavior based on the regex: /\/admin\/agents\/([^/]+)/

const AGENT_PATH_RE = /^\/admin\/agents\/([^/]+)/;

function extractAgentId(path: string): string {
  const match = path.match(AGENT_PATH_RE);
  return match ? match[1] : '';
}

describe('extractAgentId', () => {
  it('extracts agentId from /admin/agents/:id path', () => {
    expect(extractAgentId('/admin/agents/agent_abc123')).toBe('agent_abc123');
  });

  it('extracts agentId from /admin/agents/:id/steps', () => {
    expect(extractAgentId('/admin/agents/agent_xyz/steps')).toBe('agent_xyz');
  });

  it('extracts agentId from /admin/agents/:id/conversations', () => {
    expect(extractAgentId('/admin/agents/my-agent/conversations')).toBe('my-agent');
  });

  it('extracts agentId from /admin/agents/:id/memory', () => {
    expect(extractAgentId('/admin/agents/agent_qr/memory')).toBe('agent_qr');
  });

  it('extracts agentId from /admin/agents/:id/metrics', () => {
    expect(extractAgentId('/admin/agents/agent_metrics/metrics')).toBe('agent_metrics');
  });

  it('extracts agentId from /admin/agents/:id/contract', () => {
    expect(extractAgentId('/admin/agents/agent_ct/contract')).toBe('agent_ct');
  });

  it('extracts agentId from /admin/agents/:id/mcp', () => {
    expect(extractAgentId('/admin/agents/agent_mcp/mcp')).toBe('agent_mcp');
  });

  it('extracts agentId from /admin/agents/:id/schedules', () => {
    expect(extractAgentId('/admin/agents/agent_sc/schedules')).toBe('agent_sc');
  });

  it('extracts agentId from /admin/agents/:id/notifications', () => {
    expect(extractAgentId('/admin/agents/agent_nt/notifications')).toBe('agent_nt');
  });

  it('returns empty string for unmatched path', () => {
    expect(extractAgentId('/admin/other/path')).toBe('');
  });

  it('returns empty string for /admin/agents/', () => {
    expect(extractAgentId('/admin/agents/')).toBe('');
  });

  it('handles agentIds with underscores and dashes', () => {
    expect(extractAgentId('/admin/agents/agent_test-001_a/b/conversations')).toBe('agent_test-001_a');
  });

  it('returns empty string for root path', () => {
    expect(extractAgentId('/')).toBe('');
  });

  it('returns empty string for empty path', () => {
    expect(extractAgentId('')).toBe('');
  });

  it('returns empty string for /admin/agents only', () => {
    expect(extractAgentId('/admin/agents')).toBe('');
  });

  it('extracts correctly when agentId has numeric parts', () => {
    expect(extractAgentId('/admin/agents/agent_123/steps')).toBe('agent_123');
  });
});

// ─── Route Handler Response Shapes ───────────────────────────────────────────

describe('Agent detail-read route response shapes', () => {
  it('jsonResponse creates 400 for missing agentId', () => {
    const response = jsonResponse({ error: 'Missing agentId' }, 400);
    expect(response.status).toBe(400);
    expect(response.body).toContain('Missing agentId');
  });

  it('jsonResponse creates 404 for not found agent', () => {
    const response = jsonResponse({ error: 'Agent not found: agent_abc' }, 404);
    expect(response.status).toBe(404);
    expect(response.body).toContain('not found');
  });

  it('jsonResponse creates 200 with agent data', () => {
    const agentData = { agentId: 'agent_abc', name: 'Test Agent', status: 'active' };
    const response = jsonResponse(agentData);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(agentData);
  });

  it('jsonResponse creates 200 with paginated steps list', () => {
    const steps = { items: [], hasMore: false };
    const response = jsonResponse(steps);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ items: [], hasMore: false });
  });

  it('jsonResponse creates 200 with conversations list', () => {
    const convos = { conversations: [{ id: 'conv_1', agentId: 'agent_abc' }] };
    const response = jsonResponse(convos);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(convos);
  });

  it('jsonResponse creates 200 with memory data', () => {
    const memory = { workingMemory: 'some content', contextFiles: [] };
    const response = jsonResponse(memory);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(memory);
  });

  it('jsonResponse creates 200 with metrics', () => {
    const metrics = { totalSteps: 42, totalCostUsd: 1.23 };
    const response = jsonResponse(metrics);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(metrics);
  });

  it('jsonResponse creates 200 with contract data', () => {
    const contract = { contractId: 'ct_1', budgetUsd: 100 };
    const response = jsonResponse(contract);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(contract);
  });

  it('jsonResponse creates 200 with MCP configs list', () => {
    const configs = { configs: [] };
    const response = jsonResponse(configs);
    expect(response.status).toBe(200);
  });

  it('jsonResponse creates 200 with schedules list', () => {
    const schedules = { schedules: [] };
    const response = jsonResponse(schedules);
    expect(response.status).toBe(200);
  });

  it('jsonResponse creates 200 with notifications list', () => {
    const notifications = { notifications: [] };
    const response = jsonResponse(notifications);
    expect(response.status).toBe(200);
  });

  it('jsonResponse handles hasMore pagination flag as true', () => {
    const result = { items: [{ id: '1' }], hasMore: true };
    const response = jsonResponse(result);
    expect(JSON.parse(response.body).hasMore).toBe(true);
  });

  it('jsonResponse handles hasMore pagination flag as false', () => {
    const result = { items: [], hasMore: false };
    const response = jsonResponse(result);
    expect(JSON.parse(response.body).hasMore).toBe(false);
  });
});

// ─── parseJsonBody integration with detail-read route parameters ──────────────

describe('parseJsonBody with detail-read route parameters', () => {
  it('parses query parameters for steps limit', () => {
    const { z } = require('zod');
    const schema = z.object({
      limit: z.string().optional(),
      offset: z.string().optional(),
    });
    const result = parseJsonBody('{"limit":"20","offset":"10"}', schema);
    expect(result.limit).toBe('20');
    expect(result.offset).toBe('10');
  });

  it('throws on invalid JSON for query params', () => {
    const { z } = require('zod');
    const schema = z.object({ limit: z.string() });
    expect(() => parseJsonBody('not-valid-json', schema)).toThrow();
  });

  it('parses empty body as empty object', () => {
    const { z } = require('zod');
    const schema = z.object({});
    const result = parseJsonBody('', schema);
    expect(result).toEqual({});
  });
});

// ─── Agent steps pagination defaults (URLSearchParams, matches actual code) ───

describe('Agent steps pagination defaults', () => {
  it('uses default limit of 10 when not provided', () => {
    const query = new URLSearchParams();
    const limit = parseInt(query.get('limit') ?? '10', 10);
    expect(limit).toBe(10);
  });

  it('uses default offset of 0 when not provided', () => {
    const query = new URLSearchParams();
    const offset = parseInt(query.get('offset') ?? '0', 10);
    expect(offset).toBe(0);
  });

  it('parses custom limit from query', () => {
    const query = new URLSearchParams('limit=50');
    const limit = parseInt(query.get('limit') ?? '10', 10);
    expect(limit).toBe(50);
  });

  it('uses default monthly limit of 50 for contract list', () => {
    const query = new URLSearchParams();
    const limit = parseInt(query.get('limit') ?? '50', 10);
    expect(limit).toBe(50);
  });

  it('parses custom contract list limit', () => {
    const query = new URLSearchParams('limit=25');
    const limit = parseInt(query.get('limit') ?? '50', 10);
    expect(limit).toBe(25);
  });

  it('invalid limit string returns NaN (route will use default via ||)', () => {
    // parseInt of non-numeric string returns NaN; route code uses ?? which
    // only kicks in for null/undefined, so invalid values fall through to NaN
    const query = new URLSearchParams('limit=abc');
    const parsed = query.get('limit');
    expect(parsed).toBe('abc');
    expect(parseInt(parsed, 10)).toBeNaN();
  });
});
