import { describe, expect, it, vi } from 'vitest';

vi.mock('../llm/settings-store', () => {
  return {
    createLlmSettingsStore: vi.fn((_db) => {
      return {
        getResolvedDefaults: async () => ({
          primaryProfile: { profileId: 'default-primary', isEnabled: true },
          omProfile: { profileId: 'default-om', isEnabled: true },
          hiringRhProfile: { profileId: 'default-rh', isEnabled: true },
        }),
      };
    }),
  };
});

import { buildHiredAgentProfile } from './hiring-profile';
import { createLlmSettingsStore } from '../llm/settings-store';

describe('buildHiredAgentProfile', () => {
  it('returns profile with trimmed name', async () => {
    const result = await buildHiredAgentProfile({} as any, { agentName: '  Test Agent  ' });
    expect(result.name).toBe('Test Agent');
  });

  it('returns profile with trimmed description', async () => {
    const result = await buildHiredAgentProfile({} as any, {
      agentName: 'Agent',
      agentDescription: '  A helpful developer  ',
    });
    expect(result.description).toBe('A helpful developer');
  });

  it('returns profile without description when undefined', async () => {
    const result = await buildHiredAgentProfile({} as any, { agentName: 'Agent' });
    expect(result.description).toBeUndefined();
  });

  it('includes modelProfileId from resolved defaults', async () => {
    (createLlmSettingsStore as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      getResolvedDefaults: async () => ({
        primaryProfile: { profileId: 'custom-prof', isEnabled: true },
        omProfile: { profileId: 'om-custom', isEnabled: true },
        hiringRhProfile: { profileId: 'rh-1', isEnabled: true },
      }),
    });
    const result = await buildHiredAgentProfile({} as any, { agentName: 'Agent' });
    expect(result.modelProfileId).toBe('custom-prof');
  });

  it('includes omModelProfileId from resolved defaults', async () => {
    (createLlmSettingsStore as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      getResolvedDefaults: async () => ({
        primaryProfile: { profileId: 'p1', isEnabled: true },
        omProfile: { profileId: 'om-profile-x', isEnabled: true },
        hiringRhProfile: { profileId: 'rh-1', isEnabled: true },
      }),
    });
    const result = await buildHiredAgentProfile({} as any, { agentName: 'Agent' });
    expect(result.omModelProfileId).toBe('om-profile-x');
  });

  it('handles empty string name by trimming to empty', async () => {
    const result = await buildHiredAgentProfile({} as any, { agentName: '   ' });
    expect(result.name).toBe('');
  });

  it('handles name with only whitespace and tabs', async () => {
    const result = await buildHiredAgentProfile({} as any, { agentName: '\t\n  \t\n' });
    expect(result.name).toBe('');
  });

  it('handles description with mixed whitespace', async () => {
    const result = await buildHiredAgentProfile({} as any, {
      agentName: 'A',
      agentDescription: '  desc  with  spaces  ',
    });
    expect(result.description).toBe('desc  with  spaces');
  });
});
