import { describe, expect, it } from 'vitest';

import { parseObserverOutput } from './operational-memory-prompting.js';

describe('parseObserverOutput', () => {
  it('falls back to list items when observations xml is missing', () => {
    const output = [
      'Date: Apr 25 2026',
      '* 🔴 (5:30 PM) User is working on tile base rendering.',
      '* 🔴 (5:31 PM) Next step is to inspect the overflow accounting.',
      '',
      '<current-task>',
      'Investigating operational memory overflow.',
      '</current-task>',
    ].join('\n');

    expect(parseObserverOutput(output)).toEqual({
      observations: [
        '* 🔴 (5:30 PM) User is working on tile base rendering.',
        '* 🔴 (5:31 PM) Next step is to inspect the overflow accounting.',
      ].join('\n'),
      currentTask: 'Investigating operational memory overflow.',
      suggestedContinuation: undefined,
      rawOutput: output,
    });
  });
});
