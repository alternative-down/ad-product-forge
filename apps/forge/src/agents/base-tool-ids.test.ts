import { describe, expect, it } from 'vitest';
import { AGENT_BASE_TOOL_IDS, AGENT_BASE_TOOL_ID_SET } from './base-tool-ids';

describe('AGENT_BASE_TOOL_IDS', () => {
  it('contains expected tool ids', () => {
    expect(AGENT_BASE_TOOL_IDS).toContain('list_contacts');
    expect(AGENT_BASE_TOOL_IDS).toContain('send_message');
    expect(AGENT_BASE_TOOL_IDS).toContain('list_agent_notifications');
    expect(AGENT_BASE_TOOL_IDS).toContain('manage_self_crons');
  });

  it('has 10 tool ids', () => {
    expect(AGENT_BASE_TOOL_IDS).toHaveLength(10);
  });
});

describe('AGENT_BASE_TOOL_ID_SET', () => {
  it('contains all base tool ids', () => {
    for (const id of AGENT_BASE_TOOL_IDS) {
      expect(AGENT_BASE_TOOL_ID_SET.has(id)).toBe(true);
    }
  });

  it('has same size as base tool ids array', () => {
    expect(AGENT_BASE_TOOL_ID_SET.size).toBe(AGENT_BASE_TOOL_IDS.length);
  });

  it('does not contain unknown id', () => {
    expect(AGENT_BASE_TOOL_ID_SET.has('unknown_tool')).toBe(false);
  });

  it('is a Set', () => {
    expect(AGENT_BASE_TOOL_ID_SET).toBeInstanceOf(Set);
  });
});