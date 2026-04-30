import { describe, expect, it } from 'vitest';
import { AGENT_BASE_TOOL_IDS, AGENT_BASE_TOOL_ID_SET } from './base-tool-ids';

describe('AGENT_BASE_TOOL_IDS', () => {
  it('is a readonly tuple of 10 tool IDs', () => {
    expect(AGENT_BASE_TOOL_IDS.length).toBe(10);
  });

  it('contains expected tool IDs', () => {
    expect(AGENT_BASE_TOOL_IDS).toContain('list_contacts');
    expect(AGENT_BASE_TOOL_IDS).toContain('send_message');
    expect(AGENT_BASE_TOOL_IDS).toContain('list_agent_notifications');
    expect(AGENT_BASE_TOOL_IDS).toContain('publish_skill_to_catalog');
    expect(AGENT_BASE_TOOL_IDS).toContain('list_self_crons');
    expect(AGENT_BASE_TOOL_IDS).toContain('manage_self_crons');
  });

  it('does not contain forge-specific tools', () => {
    expect(AGENT_BASE_TOOL_IDS).not.toContain('hire-internal-agent');
    expect(AGENT_BASE_TOOL_IDS).not.toContain('terminate-internal-agent');
    expect(AGENT_BASE_TOOL_IDS).not.toContain('get_github_git_credentials');
  });
});

describe('AGENT_BASE_TOOL_ID_SET', () => {
  it('is a Set with the same entries as AGENT_BASE_TOOL_IDS', () => {
    expect(AGENT_BASE_TOOL_ID_SET.size).toBe(AGENT_BASE_TOOL_IDS.length);
  });

  it('contains known tool IDs', () => {
    expect(AGENT_BASE_TOOL_ID_SET.has('list_contacts')).toBe(true);
    expect(AGENT_BASE_TOOL_ID_SET.has('send_message')).toBe(true);
  });

  it('does not contain forge-only tool IDs', () => {
    expect(AGENT_BASE_TOOL_ID_SET.has('hire-internal-agent')).toBe(false);
  });
});
