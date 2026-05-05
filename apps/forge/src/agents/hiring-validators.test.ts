import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeAgentName, validateGeneratedAgentProfile, isToolResultWithOutput, validateHireAgentInput } from './hiring-validators';

// ─── Mock setup ────────────────────────────────────────────────────────────────

const mockGetRole = vi.fn();

const mockCapabilities = {
  getRole: mockGetRole,
} as unknown as ReturnType<typeof import('../capabilities/store').createCapabilityStore>;

// ─── normalizeAgentName ─────────────────────────────────────────────────────────

describe('normalizeAgentName', () => {
  it('trims whitespace', () => {
    expect(normalizeAgentName('  Kaelen  ')).toBe('kaelen');
  });

  it('converts to lowercase', () => {
    expect(normalizeAgentName('KAELEN')).toBe('kaelen');
  });

  it('handles mixed case and whitespace', () => {
    expect(normalizeAgentName('  Kaelen  ')).toBe('kaelen');
    expect(normalizeAgentName('KaEleN')).toBe('kaelen');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeAgentName('')).toBe('');
    expect(normalizeAgentName('   ')).toBe('');
  });

  it('is idempotent', () => {
    const name = '  Kaelen  ';
    expect(normalizeAgentName(normalizeAgentName(name))).toBe('kaelen');
  });
});

// ─── validateGeneratedAgentProfile ───────────────────────────────────────────

describe('validateGeneratedAgentProfile', () => {
  it('returns valid for profile without tool ids', () => {
    const result = validateGeneratedAgentProfile({
      primaryGoal: 'Develop web applications',
      secondaryGoals: ['Write clean code', 'Test thoroughly'],
      backstory: 'Experienced fullstack developer',
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid when primaryGoal mentions a tool id', () => {
    const result = validateGeneratedAgentProfile({
      primaryGoal: 'Use send_message to communicate',
      secondaryGoals: ['Other task'],
      backstory: 'Agent developer',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must not mention tool ids directly');
  });

  it('returns invalid when secondaryGoals mentions a tool id', () => {
    const result = validateGeneratedAgentProfile({
      primaryGoal: 'Develop applications',
      secondaryGoals: ['Use list_contacts', 'Other task'],
      backstory: 'Agent developer',
    });
    expect(result.valid).toBe(false);
  });

  it('returns invalid when backstory mentions a tool id', () => {
    const result = validateGeneratedAgentProfile({
      primaryGoal: 'Develop applications',
      secondaryGoals: ['Other task'],
      backstory: 'Expert in send_message and list_conversations',
    });
    expect(result.valid).toBe(false);
  });

  it('returns hint listing mentioned tool ids', () => {
    const result = validateGeneratedAgentProfile({
      primaryGoal: 'Use send_message tool',
      secondaryGoals: ['Use list_contacts'],
      backstory: 'Expert',
    });
    expect(result.valid).toBe(false);
    expect(result.hint).toContain('send_message');
    expect(result.hint).toContain('list_contacts');
  });

  it('returns valid for profile with no secondary goals', () => {
    const result = validateGeneratedAgentProfile({
      primaryGoal: 'Develop applications',
      secondaryGoals: [],
      backstory: 'Developer',
    });
    expect(result.valid).toBe(true);
  });
});

// ─── isToolResultWithOutput ─────────────────────────────────────────────────────

describe('isToolResultWithOutput', () => {
  it('returns true for object with output property', () => {
    expect(isToolResultWithOutput({ output: 'hello' })).toBe(true);
    expect(isToolResultWithOutput({ output: 123 })).toBe(true);
    expect(isToolResultWithOutput({ output: null })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isToolResultWithOutput(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isToolResultWithOutput(undefined)).toBe(false);
  });

  it('returns false for object without output', () => {
    expect(isToolResultWithOutput({})).toBe(false);
    expect(isToolResultWithOutput({ result: 'data' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isToolResultWithOutput('string')).toBe(false);
    expect(isToolResultWithOutput(123)).toBe(false);
    expect(isToolResultWithOutput(false)).toBe(false);
    expect(isToolResultWithOutput([])).toBe(false);
  });

  it('returns true for object with undefined output (in operator checks key existence)', () => {
    expect(isToolResultWithOutput({ output: undefined })).toBe(true);
  });
});

// ─── validateHireAgentInput ─────────────────────────────────────────────────────

describe('validateHireAgentInput', () => {
  beforeEach(() => {
    mockGetRole.mockReset();
  });

  it('returns invalid when role does not exist', async () => {
    mockGetRole.mockResolvedValueOnce(null);
    const result = await validateHireAgentInput(mockCapabilities, 'nonexistent-role');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('returns valid when role has all base tools', async () => {
    mockGetRole.mockResolvedValueOnce({
      id: 'developer',
      name: 'Developer',
      toolIds: [
        'list_conversations',
        'get_messages',
        'send_message',
        'list_self_crons',
        'manage_self_crons',
        'extra_tool',
      ],
      description: 'Developer role',
    });
    const result = await validateHireAgentInput(mockCapabilities, 'developer');
    expect(result.valid).toBe(true);
    expect((result as { valid: true }).roleId).toBe('developer');
    expect((result as { valid: true }).roleName).toBe('Developer');
  });

  it('returns invalid when role is missing base tools', async () => {
    mockGetRole.mockResolvedValueOnce({
      id: 'incomplete-role',
      name: 'Incomplete Role',
      toolIds: ['list_contacts', 'send_message'],
    });
    const result = await validateHireAgentInput(mockCapabilities, 'incomplete-role');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('missing required base tools');
  });

  it('hint tells to call manage_role_capabilities', async () => {
    mockGetRole.mockResolvedValueOnce({
      id: 'incomplete-role',
      name: 'Incomplete Role',
      toolIds: ['list_contacts'],
    });
    const result = await validateHireAgentInput(mockCapabilities, 'incomplete-role');
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string; hint?: string }).hint).toContain('Call manage_role_capabilities');
  });

  it('includes roleDescription when available', async () => {
    mockGetRole.mockResolvedValueOnce({
      id: 'developer',
      name: 'Developer',
      toolIds: [
        'list_conversations',
        'get_messages',
        'send_message',
        'list_self_crons',
        'manage_self_crons',
      ],
      description: 'Fullstack developer',
    });
    const result = await validateHireAgentInput(mockCapabilities, 'developer');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; roleDescription?: string }).roleDescription).toBe('Fullstack developer');
  });

  it('excludes roleDescription when undefined', async () => {
    mockGetRole.mockResolvedValueOnce({
      id: 'developer',
      name: 'Developer',
      toolIds: [
        'list_conversations',
        'get_messages',
        'send_message',
        'list_self_crons',
        'manage_self_crons',
      ],
    });
    const result = await validateHireAgentInput(mockCapabilities, 'developer');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; roleDescription?: string }).roleDescription).toBeUndefined();
  });
});