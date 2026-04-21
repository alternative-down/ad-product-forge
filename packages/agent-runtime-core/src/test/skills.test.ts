import { describe, expect, it } from 'vitest';

import { InMemorySkillRegistry } from '../integrations/skills/in-memory-skill-registry.js';

describe('InMemorySkillRegistry', () => {
  it('registers and lists skills', async () => {
    const registry = new InMemorySkillRegistry();

    await registry.register({
      id: 'skill-1',
      name: 'Research',
      description: 'Researches a topic well',
      instructions: 'Read sources carefully.',
    });

    const listed = await registry.list();
    const found = await registry.get('skill-1');

    expect(listed).toHaveLength(1);
    expect(found?.name).toBe('Research');
  });

  it('removes registered skills', async () => {
    const registry = new InMemorySkillRegistry();

    await registry.register({
      id: 'skill-1',
      name: 'Research',
      description: 'Researches a topic well',
      instructions: 'Read sources carefully.',
    });

    await registry.remove('skill-1');

    expect(await registry.get('skill-1')).toBeNull();
    expect(await registry.list()).toEqual([]);
  });
});
