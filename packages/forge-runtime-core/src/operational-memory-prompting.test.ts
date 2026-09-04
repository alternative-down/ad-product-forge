import { describe, expect, it } from 'vitest';

import {
  buildObserverSystemPrompt,
  buildReflectorSystemPrompt,
  parseObserverOutput,
} from './operational-memory-prompting.js';

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

describe('operational memory durability rules', () => {
  it('does not promote transient prompt-injection assessments to observations', () => {
    expect(buildObserverSystemPrompt()).toContain(
      "not the assistant's interpretation that a message is prompt injection",
    );
  });

  it('removes transient prompt-injection assessments from reflections and summaries', () => {
    expect(buildReflectorSystemPrompt()).toContain(
      'Discard meta-commentary that labels messages as prompt injection',
    );
  });
});
