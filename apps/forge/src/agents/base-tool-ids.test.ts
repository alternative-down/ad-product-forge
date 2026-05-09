/**
 * Unit tests for agents/base-tool-ids.ts.
 * Static constants: AGENT_BASE_TOOL_IDS and AGENT_BASE_TOOL_ID_SET.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_BASE_TOOL_IDS, AGENT_BASE_TOOL_ID_SET } from './base-tool-ids';

const EXPECTED_TOOL_IDS = [
  'list_contacts',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'change_chat_group',
  'list_agent_notifications',
  'publish_skill_to_catalog',
  'list_self_crons',
  'manage_self_crons',
] as const;

describe('AGENT_BASE_TOOL_IDS', () => {
  it('is an array of 10 tool ids', () => {
    expect(AGENT_BASE_TOOL_IDS).toHaveLength(10);
  });

  it('has the expected tool ids in order', () => {
    expect([...AGENT_BASE_TOOL_IDS]).toEqual([...EXPECTED_TOOL_IDS]);
  });

  it('is a readonly tuple', () => {
    const ids: readonly string[] = AGENT_BASE_TOOL_IDS;
    expect(Array.isArray(AGENT_BASE_TOOL_IDS)).toBe(true);
  });

  it('contains send_message', () => {
    expect(AGENT_BASE_TOOL_IDS).toContain('send_message');
  });

  it('contains list_conversations', () => {
    expect(AGENT_BASE_TOOL_IDS).toContain('list_conversations');
  });

  it('contains publish_skill_to_catalog', () => {
    expect(AGENT_BASE_TOOL_IDS).toContain('publish_skill_to_catalog');
  });

  it('contains no duplicates', () => {
    const unique = new Set(AGENT_BASE_TOOL_IDS);
    expect(unique.size).toBe(AGENT_BASE_TOOL_IDS.length);
  });
});

describe('AGENT_BASE_TOOL_ID_SET', () => {
  it('is a Set', () => {
    expect(AGENT_BASE_TOOL_ID_SET).toBeInstanceOf(Set);
  });

  it('has the same size as AGENT_BASE_TOOL_IDS', () => {
    expect(AGENT_BASE_TOOL_ID_SET.size).toBe(AGENT_BASE_TOOL_IDS.length);
  });

  it('contains all tool ids from AGENT_BASE_TOOL_IDS', () => {
    for (const toolId of AGENT_BASE_TOOL_IDS) {
      expect(AGENT_BASE_TOOL_ID_SET.has(toolId)).toBe(true);
    }
  });

  it('returns true for known tool ids', () => {
    expect(AGENT_BASE_TOOL_ID_SET.has('send_message')).toBe(true);
    expect(AGENT_BASE_TOOL_ID_SET.has('list_conversations')).toBe(true);
    expect(AGENT_BASE_TOOL_ID_SET.has('change_chat_group')).toBe(true);
  });

  it('returns false for unknown tool ids', () => {
    expect(AGENT_BASE_TOOL_ID_SET.has('unknown_tool')).toBe(false);
    expect(AGENT_BASE_TOOL_ID_SET.has('workspace_execute_command')).toBe(false);
    expect(AGENT_BASE_TOOL_ID_SET.has('')).toBe(false);
  });

  it('reflects the same items as AGENT_BASE_TOOL_IDS', () => {
    const setItems = new Set(AGENT_BASE_TOOL_ID_SET);
    const arrayItems = new Set(AGENT_BASE_TOOL_IDS);
    expect(setItems).toEqual(arrayItems);
  });
});
