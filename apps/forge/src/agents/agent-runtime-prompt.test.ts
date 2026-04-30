import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from './agent-runtime-prompt';

describe('buildAgentSystemPrompt', () => {
  it('returns non-string instructions unchanged (passthrough overload)', () => {
    const instructions = { raw: 'data', nested: { key: 'value' } };
    const result = buildAgentSystemPrompt({
      instructions,
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toBe(instructions);
  });

  it('returns non-string instructions unchanged when other params are empty', () => {
    const instructions = ['item1', 'item2'];
    const result = buildAgentSystemPrompt({
      instructions,
      agentId: '',
      agentSlug: '',
      agentName: '',
    });
    expect(result).toBe(instructions);
  });

  it('returns non-string instructions unchanged when all params provided', () => {
    const instructions = { complex: { deeply: { nested: 42 } } };
    const result = buildAgentSystemPrompt({
      instructions,
      agentId: 'agent-abc',
      agentSlug: 'my-agent',
      agentName: 'My Agent',
      agentDescription: 'A test agent',
      roleName: 'Developer',
      roleDescription: 'Writes code',
      companyName: 'Acme Corp',
      companyContext: 'Software company',
    });
    expect(result).toBe(instructions);
  });

  it('wraps content in agent_identity and assigned_instructions tags', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toContain('<agent_identity>');
    expect(result).toContain('</agent_identity>');
    expect(result).toContain('<assigned_instructions>');
    expect(result).toContain('</assigned_instructions>');
  });

  it('includes agentId in identity section', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toContain('- Agent id: agent-1');
  });

  it('includes agentSlug in identity section', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'my-slug',
      agentName: 'Test Agent',
    });
    expect(result).toContain('- Agent slug: my-slug');
  });

  it('includes agentName in identity section', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Alice Agent',
    });
    expect(result).toContain('- Agent name: Alice Agent');
  });

  it('omits agent description line when not provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).not.toContain('Agent description');
  });

  it('includes agentDescription when provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      agentDescription: 'A helpful assistant',
    });
    expect(result).toContain('- Agent description: A helpful assistant');
  });

  it('omits role name line when not provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).not.toContain('Role name');
  });

  it('includes roleName when provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      roleName: 'Backend Developer',
    });
    expect(result).toContain('- Role name: Backend Developer');
  });

  it('omits role description line when not provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).not.toContain('Role description');
  });

  it('includes roleDescription when provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      roleName: 'Backend Developer',
      roleDescription: 'Builds APIs and services',
    });
    expect(result).toContain('- Role description: Builds APIs and services');
  });

  it('omits company_name line when companyName not provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).not.toContain('Company name');
  });

  it('omits company information line when companyContext not provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      companyName: 'Acme Inc',
    });
    expect(result).not.toContain('Company information');
  });

  it('includes companyName when provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      companyName: 'Acme Inc',
    });
    expect(result).toContain('- Company name: Acme Inc');
  });

  it('includes companyContext as company information when provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      companyName: 'Acme Inc',
      companyContext: 'Software development company',
    });
    expect(result).toContain('- Company information: Software development company');
  });

  it('includes company_context wrapper tag when companyName provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      companyName: 'Acme Inc',
    });
    expect(result).toContain('<company_context>');
    expect(result).toContain('</company_context>');
  });

  it('places instructions inside assigned_instructions tag', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Ship the feature today.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toContain('<assigned_instructions>');
    expect(result).toContain('Ship the feature today.');
    expect(result).toContain('</assigned_instructions>');
  });

  it('includes operating_directives section', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toContain('<operating_directives>');
    expect(result).toContain('</operating_directives>');
  });

  it('trims whitespace from agentDescription', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      agentDescription: '  A helpful assistant  ',
    });
    expect(result).toContain('- Agent description: A helpful assistant');
    expect(result).not.toContain('  A helpful assistant  ');
  });

  it('trims whitespace from roleName', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      roleName: '  Backend Developer  ',
    });
    expect(result).toContain('- Role name: Backend Developer');
    expect(result).not.toContain('  Backend Developer  ');
  });

  it('trims whitespace from roleDescription', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      roleDescription: '  Builds APIs  ',
    });
    expect(result).toContain('- Role description: Builds APIs');
    expect(result).not.toContain('  Builds APIs  ');
  });

  it('trims whitespace from companyName', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      companyName: '  Acme Inc  ',
    });
    expect(result).toContain('- Company name: Acme Inc');
    expect(result).not.toContain('  Acme Inc  ');
  });

  it('trims whitespace from companyContext', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Do the task.',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
      companyContext: '  Software company  ',
    });
    expect(result).toContain('- Company information: Software company');
    expect(result).not.toContain('  Software company  ');
  });

  it('trims instructions', () => {
    const result = buildAgentSystemPrompt({
      instructions: '  Do the task.  ',
      agentId: 'agent-1',
      agentSlug: 'test-agent',
      agentName: 'Test Agent',
    });
    expect(result).toContain('Do the task.');
    expect(result).not.toContain('  Do the task.  ');
  });

  it('returns string with all sections when all optional fields provided', () => {
    const result = buildAgentSystemPrompt({
      instructions: 'Build the thing.',
      agentId: 'agent-1',
      agentSlug: 'builder',
      agentName: 'Builder Agent',
      agentDescription: 'Constructs things',
      roleName: 'Builder',
      roleDescription: 'Builds things',
      companyName: 'Acme',
      companyContext: 'A software company',
    });
    expect(result).toContain('<agent_identity>');
    expect(result).toContain('<company_context>');
    expect(result).toContain('<assigned_instructions>');
    expect(result).toContain('<operating_directives>');
    expect(result).toContain('- Agent id: agent-1');
    expect(result).toContain('- Agent slug: builder');
    expect(result).toContain('- Agent name: Builder Agent');
    expect(result).toContain('- Agent description: Constructs things');
    expect(result).toContain('- Role name: Builder');
    expect(result).toContain('- Role description: Builds things');
    expect(result).toContain('- Company name: Acme');
    expect(result).toContain('- Company information: A software company');
    expect(result).toContain('Build the thing.');
  });
});