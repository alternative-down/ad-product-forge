import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from './runtime/prompt';

describe('buildAgentSystemPrompt', () => {
  // --- Overload: instructions as string returns full system prompt ---

  it('returns full system prompt with all sections for minimal input', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do good work.',
      agentId: 'agent-001',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toContain('<agent_identity>');
    expect(result).toContain('<company_context>');
    expect(result).toContain('<assigned_instructions>');
    expect(result).toContain('<operating_directives>');
    expect(result).toContain('Do good work.');
  });

  it('includes agent identity fields correctly', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Ship it.',
      agentId: 'my-id',
      agentSlug: 'my-slug',
      agentName: 'My Name',
      agentDescription: 'Does things.',
      roleName: 'Developer',
      roleDescription: 'Builds software.',
    });
    expect(result).toContain('Agent id: my-id');
    expect(result).toContain('Agent slug: my-slug');
    expect(result).toContain('Agent name: My Name');
    expect(result).toContain('Agent description: Does things.');
    expect(result).toContain('Role name: Developer');
    expect(result).toContain('Role description: Builds software.');
  });

  it('omits optional fields when not provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Test only.',
      agentId: 'id-only',
      agentSlug: 'slug-only',
      agentName: 'Name Only',
    });
    expect(result).not.toContain('Agent description:');
    expect(result).not.toContain('Role name:');
    expect(result).not.toContain('Role description:');
    expect(result).not.toContain('Company name:');
    expect(result).not.toContain('Company information:');
  });

  it('includes company context when provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Read the manual.',
      agentId: 'corp-agent',
      agentSlug: 'corp-agent',
      agentName: 'Corp Agent',
      companyName: 'Acme Corp',
      companyContext: 'We sell things.',
    });
    expect(result).toContain('Company name: Acme Corp');
    expect(result).toContain('Company information: We sell things.');
  });

  it('omits company content when companyName and companyContext are absent', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do stuff.',
      agentId: 'solo',
      agentSlug: 'solo',
      agentName: 'Solo Agent',
    });
    const ccMatch = result.match(/<company_context>([\s\S]*?)<\/company_context>/);
    expect(ccMatch).toBeTruthy();
    expect(ccMatch![1].trim()).toBe('## Company Context');
  });

  it('trims whitespace from agentDescription', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Trim test.',
      agentId: 'trim-test',
      agentSlug: 'trim-test',
      agentName: 'Trim Test',
      agentDescription: '  has padding  ',
    });
    expect(result).toContain('Agent description: has padding');
  });

  it('trims whitespace from roleName and roleDescription', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Role trim.',
      agentId: 'role-trim',
      agentSlug: 'role-trim',
      agentName: 'Role Trim',
      roleName: '  Developer  ',
      roleDescription: '  Builds code  ',
    });
    expect(result).toContain('Role name: Developer');
    expect(result).toContain('Role description: Builds code');
  });

  it('trims whitespace from companyName and companyContext', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Company trim.',
      agentId: 'co-trim',
      agentSlug: 'co-trim',
      agentName: 'Co Trim',
      companyName: '  Acme  ',
      companyContext: '  We make things  ',
    });
    expect(result).toContain('Company name: Acme');
    expect(result).toContain('Company information: We make things');
  });

  it('trims instructions before inserting', () => {
    const result = buildAgentSystemPrompt({
      instructions: '  \n  Leading/trailing spaces  \n  ',
      agentId: 'trim-instr',
      agentSlug: 'trim-instr',
      agentName: 'Trim Instr',
    });
    expect(result).toContain('Leading/trailing spaces');
  });

  it('closes all XML-like section tags', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Close tags.',
      agentId: 'close-test',
      agentSlug: 'close-test',
      agentName: 'Close Test',
    });
    const openTags = result.match(/<(\w+)>/g) ?? [];
    const closeTags = result.match(/<\/(\w+)>/g) ?? [];
    expect(openTags.length).toBe(closeTags.length);
  });

  it('returns the same result for same inputs', () => {
    const input = {
      instructions: 'Stable output.',
      agentId: 'stable-id',
      agentSlug: 'stable-slug',
      agentName: 'Stable Name',
    };
    const r1 = buildAgentSystemPrompt(input);
    const r2 = buildAgentSystemPrompt(input);
    expect(r1).toBe(r2);
  });

  it('produces different output for different instructions', () => {
    const base = {
      agentId: 'base-id',
      agentSlug: 'base-slug',
      agentName: 'Base Name',
    };
    const r1 = buildAgentSystemPrompt({ ...base, instructions: 'First task.' });
    const r2 = buildAgentSystemPrompt({ ...base, instructions: 'Second task.' });
    expect(r1).not.toBe(r2);
    expect(r1).toContain('First task.');
    expect(r2).toContain('Second task.');
  });

  it('produces different output for different agentId', () => {
    const base = {
      instructions: 'Same instr.',
      agentSlug: 'same-slug',
      agentName: 'Same Name',
    };
    const r1 = buildAgentSystemPrompt({ ...base, agentId: 'id-alpha' });
    const r2 = buildAgentSystemPrompt({ ...base, agentId: 'id-beta' });
    expect(r1).toContain('Agent id: id-alpha');
    expect(r2).toContain('Agent id: id-beta');
    expect(r1).not.toBe(r2);
  });

  // --- Overload: instructions not string returns instructions as-is ---

  it('returns non-string instructions unchanged', () => {
    const obj = { task: 'complex object' };
    const result = buildAgentSystemPrompt({
      instructions: obj,
      agentId: 'any-id',
      agentSlug: 'any-slug',
      agentName: 'Any Name',
    });
    expect(result).toBe(obj);
  });

  it('returns number instructions unchanged', () => {
    const result = buildAgentSystemPrompt({
      instructions: 42,
      agentId: 'num-id',
      agentSlug: 'num-slug',
      agentName: 'Num Name',
    });
    expect(result).toBe(42);
  });

  it('returns null instructions unchanged', () => {
    const result = buildAgentSystemPrompt({
      instructions: null,
      agentId: 'null-id',
      agentSlug: 'null-slug',
      agentName: 'Null Name',
    });
    expect(result).toBeNull();
  });

  it('returns undefined instructions unchanged', () => {
    const result = buildAgentSystemPrompt({
      instructions: undefined,
      agentId: 'undef-id',
      agentSlug: 'undef-slug',
      agentName: 'Undef Name',
    });
    expect(result).toBeUndefined();
  });

  it('returns array instructions unchanged', () => {
    const arr = ['step1', 'step2'];
    const result = buildAgentSystemPrompt({
      instructions: arr,
      agentId: 'arr-id',
      agentSlug: 'arr-slug',
      agentName: 'Arr Name',
    });
    expect(result).toBe(arr);
  });

  // --- Generic overload: instructions type T returns T ---

  it('passes through typed non-string instructions', () => {
    const template = { type: 'instruction' as const, content: 'hello' };
    const result = buildAgentSystemPrompt<{ type: 'instruction'; content: string }>({
      instructions: template,
      agentId: 'gen-id',
      agentSlug: 'gen-slug',
      agentName: 'Gen Name',
    });
    expect(result).toBe(template);
  });

  // --- Section ordering ---

  it('renders sections in correct order', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Test order.',
      agentId: 'order-id',
      agentSlug: 'order-slug',
      agentName: 'Order Name',
    });
    const aiIdx = result.indexOf('<agent_identity>');
    const ccIdx = result.indexOf('<company_context>');
    const ai2Idx = result.indexOf('<assigned_instructions>');
    const odIdx = result.indexOf('<operating_directives>');
    expect(aiIdx).toBeLessThan(ccIdx);
    expect(ccIdx).toBeLessThan(ai2Idx);
    expect(ai2Idx).toBeLessThan(odIdx);
  });

  it('operating_directives section contains real content', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Dir test.',
      agentId: 'dir-id',
      agentSlug: 'dir-slug',
      agentName: 'Dir Name',
    });
    const odMatch = result.match(/<operating_directives>([\s\S]*?)<\/operating_directives>/);
    expect(odMatch).toBeTruthy();
    const inner = odMatch![1];
    expect(inner).toContain('This is a real operating environment');
    expect(inner).toContain('Strictly follow the instructions');
    expect(inner).toContain('real company');
  });
});
