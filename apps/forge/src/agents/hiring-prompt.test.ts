import { describe, expect, it } from 'vitest';
import { buildHiringPrompt, estimateTextTokens } from './hiring-prompt';

describe('estimateTextTokens', () => {
  it('divides text length by 4 and rounds up', () => {
    expect(estimateTextTokens('abcdefgh')).toBe(2); // 8/4=2
  });

  it('rounds up partial division', () => {
    expect(estimateTextTokens('abcde')).toBe(2); // 5/4=1.25 → 2
  });

  it('handles empty string', () => {
    expect(estimateTextTokens('')).toBe(0);
  });

  it('handles short string', () => {
    expect(estimateTextTokens('ab')).toBe(1);
  });

  it('matches Math.ceil(length/4)', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 10, 100]) {
      const text = 'a'.repeat(len);
      expect(estimateTextTokens(text)).toBe(Math.ceil(len / 4));
    }
  });
});

describe('buildHiringPrompt — basic structure', () => {
  it('returns a non-empty string', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the design instruction', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(result).toContain('Design one newly hired permanent internal collaborator');
  });

  it('includes the hiring request', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(result).toContain('Hiring request:');
    expect(result).toContain('Hire a developer');
  });

  it('includes minimum base tools section', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(result).toContain('Minimum base tools:');
    expect(result).toContain('list_contacts');
  });

  it('mentions primaryGoal, secondaryGoals, backstory in tool description', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(result).toContain('primaryGoal');
    expect(result).toContain('secondaryGoals');
    expect(result).toContain('backstory');
  });

  it('includes section headers for generated agent profile', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(result).toContain('Primary Goal');
    expect(result).toContain('Secondary Goals');
    expect(result).toContain('Backstory');
  });
});

describe('buildHiringPrompt — existing agents', () => {
  it('includes existing agents when provided', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [{ name: 'Kaelen', roleName: 'Developer' }],
    });
    expect(result).toContain('Existing internal collaborators');
    expect(result).toContain('Kaelen');
    expect(result).toContain('Developer');
  });

  it('includes multiple existing agents', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [
        { name: 'Kaelen', roleName: 'Developer' },
        { name: 'Varek', roleName: 'QA' },
      ],
    });
    expect(result).toContain('Kaelen');
    expect(result).toContain('Varek');
  });

  it('shows null roleName as "Sem função definida"', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [{ name: 'NewAgent', roleName: null }],
    });
    expect(result).toContain('Sem função definida');
  });

  it('does not include existing agents section when array is empty', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [],
    });
    expect(result).not.toContain('Existing internal collaborators');
  });
});

describe('buildHiringPrompt — company context', () => {
  it('includes company name when provided', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [],
      companyName: 'Acme Corp',
    });
    expect(result).toContain('Company name:');
    expect(result).toContain('Acme Corp');
  });

  it('includes company context when provided', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [],
      companyContext: 'Software company',
    });
    expect(result).toContain('Company information:');
    expect(result).toContain('Software company');
  });

  it('does not include company context section when both are absent', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [],
    });
    expect(result).not.toContain('Company context:');
  });
});

describe('buildHiringPrompt — additional context', () => {
  it('includes additional context when provided', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [],
      additionalContext: 'Needs React experience',
    });
    expect(result).toContain('Additional hiring context:');
    expect(result).toContain('Needs React experience');
  });

  it('trims additional context whitespace', () => {
    const result = buildHiringPrompt({
      hiringRequest: 'Hire a dev',
      existingAgents: [],
      additionalContext: '  Needs React experience  ',
    });
    expect(result).toContain('Needs React experience');
    expect(result).not.toContain('  ');
  });
});

describe('buildHiringPrompt — formatting', () => {
  it('sections are separated by double newlines', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a dev', existingAgents: [] });
    expect(result).toContain('\n\n');
  });

  it('hiring request uses newline before request text', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a dev', existingAgents: [] });
    expect(result).toContain('Hiring request:\nHire a dev');
  });

  it('generated agent must not mention tool ids', () => {
    const result = buildHiringPrompt({ hiringRequest: 'Hire a dev', existingAgents: [] });
    expect(result).toContain('Do not mention tool ids');
  });
});