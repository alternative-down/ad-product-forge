/**
 * Unit tests for agents/runtime/prompt.ts.
 * buildAgentSystemPrompt — pure string formatting, zero I/O dependencies.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt } from './prompt';

// ─── Non-string instructions (passthrough) ──────────────────────────────

describe('buildAgentSystemPrompt — non-string instructions', () => {
  it('returns instructions unchanged when object', () => {
    const input = { instructions: { nested: true }, agentId: 'a', agentSlug: 'a', agentName: 'A' };
    expect(buildAgentSystemPrompt(input)).toBe(input.instructions);
  });

  it('returns instructions unchanged when number', () => {
    const input = { instructions: 42 as unknown as string, agentId: 'a', agentSlug: 'a', agentName: 'A' };
    expect(buildAgentSystemPrompt(input)).toBe(42);
  });

  it('returns instructions unchanged when null', () => {
    const input = { instructions: null as unknown as string, agentId: 'a', agentSlug: 'a', agentName: 'A' };
    expect(buildAgentSystemPrompt(input)).toBeNull();
  });

  it('returns instructions unchanged when array', () => {
    const input = { instructions: ['a', 'b'] as unknown as string, agentId: 'a', agentSlug: 'a', agentName: 'A' };
    expect(buildAgentSystemPrompt(input)).toEqual(['a', 'b']);
  });
});

// ─── Agent identity section ─────────────────────────────────────────────

describe('buildAgentSystemPrompt — agent identity section', () => {
  it('includes agent id, slug, and name', () => {
    const result = buildAgentSystemPrompt({ instructions: 'Do stuff', agentId: 'agent-abc', agentSlug: 'agent-abc', agentName: 'Test Agent' });
    expect(result).toContain('Agent id: agent-abc');
    expect(result).toContain('Agent slug: agent-abc');
    expect(result).toContain('Agent name: Test Agent');
  });

  it('omits agent description when not provided', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).not.toContain('Agent description:');
  });

  it('includes agent description when provided', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', agentDescription: 'Does things' });
    expect(result).toContain('Agent description: Does things');
  });

  it('omits description when empty string', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', agentDescription: '' });
    expect(result).not.toContain('Agent description:');
  });

  it('trims description whitespace', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', agentDescription: '  Spaced desc  ' });
    expect(result).toContain('Agent description: Spaced desc');
    expect(result).not.toContain('  Spaced desc  ');
  });

  it('omits role fields when not provided', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).not.toContain('Role name:');
    expect(result).not.toContain('Role description:');
  });

  it('includes role name and description when provided', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', roleName: '  DevOps  ', roleDescription: '  Manages infra  ' });
    expect(result).toContain('Role name: DevOps');
    expect(result).toContain('Role description: Manages infra');
    expect(result).not.toContain('  DevOps  ');
  });

  it('wraps identity in XML tags', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).toContain('<agent_identity>');
    expect(result).toContain('</agent_identity>');
  });
});

// ─── Company context section ──────────────────────────────────────────────

describe('buildAgentSystemPrompt — company context section', () => {
  it('includes company name when provided', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', companyName: 'Acme Corp' });
    expect(result).toContain('Company name: Acme Corp');
  });

  it('includes company information when provided', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', companyContext: 'Market leader in widgets' });
    expect(result).toContain('Company information: Market leader in widgets');
  });

  it('wraps context in XML tags', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A', companyName: 'Acme' });
    expect(result).toContain('<company_context>');
    expect(result).toContain('</company_context>');
  });
});

// ─── Assigned instructions section ───────────────────────────────────────

describe('buildAgentSystemPrompt — assigned instructions section', () => {
  it('wraps trimmed instructions in XML tags', () => {
    const result = buildAgentSystemPrompt({ instructions: '  Do important work  ', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).toContain('<assigned_instructions>');
    expect(result).toContain('Do important work');
    expect(result).toContain('</assigned_instructions>');
  });

  it('does not include surrounding whitespace in instructions', () => {
    const result = buildAgentSystemPrompt({ instructions: '  Trimmed  ', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).not.toContain('  Trimmed  ');
    expect(result).toContain('Trimmed');
  });
});

// ─── Operating directives section ────────────────────────────────────────

describe('buildAgentSystemPrompt — operating directives section', () => {
  it('includes operating directives header', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).toContain('<operating_directives>');
    expect(result).toContain('</operating_directives>');
  });

  it('includes real operating environment text', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).toContain('real operating environment');
  });
});

// ─── Agent context file path section ────────────────────────────────────

describe('buildAgentSystemPrompt — agent context file path section', () => {
  it('includes AGENT_CONTEXT.md reference', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    expect(result).toContain('AGENT_CONTEXT.md');
  });
});

// ─── Combined output ──────────────────────────────────────────────────────

describe('buildAgentSystemPrompt — combined output', () => {
  it('returns a string when all fields provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Write tests',
      agentId: 'my-agent',
      agentSlug: 'my-agent',
      agentName: 'My Agent',
      agentDescription: 'QA specialist',
      roleName: 'Test Engineer',
      roleDescription: 'Writes tests',
      companyName: 'Acme',
      companyContext: 'Software company',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('sections appear in correct order', () => {
    const result = buildAgentSystemPrompt({ instructions: 'x', agentId: 'a', agentSlug: 'a', agentName: 'A' });
    const idIdx = result.indexOf('<agent_identity>');
    const ctxIdx = result.indexOf('<company_context>');
    const asnIdx = result.indexOf('<assigned_instructions>');
    const opsIdx = result.indexOf('<operating_directives>');
    expect(idIdx).toBeLessThan(ctxIdx);
    expect(ctxIdx).toBeLessThan(asnIdx);
    expect(asnIdx).toBeLessThan(opsIdx);
  });
});