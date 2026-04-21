import type { RuntimePlugin } from '../../core/plugins.js';
import type { StepContentSegment } from '../../core/types.js';
import type { RuntimeJournal } from '../journal/contracts.js';

export type JournalHistoryPluginOptions = {
  name?: string;
  journal: RuntimeJournal;
  maxSteps?: number;
  includeKinds?: StepContentSegment['kind'][];
};

export function createJournalHistoryPlugin(
  options: JournalHistoryPluginOptions,
): RuntimePlugin {
  const maxSteps = options.maxSteps ?? 3;
  const includeKinds = options.includeKinds ?? ['message', 'reasoning'];

  return {
    name: options.name ?? 'journal-history',
    async provideContext(context) {
      const snapshot = await options.journal.readSnapshot(context.runtimeId);
      const historicalSteps = snapshot.steps
        .filter((step) => !context.steps.some((currentStep) => currentStep.id === step.id))
        .slice(-maxSteps);

      return historicalSteps.flatMap((step) => {
        const visibleSegments = step.modelResponse.segments
          .filter((segment) => includeKinds.includes(segment.kind));

        if (visibleSegments.length === 0) {
          return [];
        }

        return [{
          id: `journal-step:${step.id}`,
          kind: 'journal-history',
          title: `Historical step ${step.stepNumber}`,
          text: visibleSegments.map((segment) => {
            if (segment.kind === 'message') {
              return segment.text;
            }

            return `[${segment.kind}] ${segment.text}`;
          }).join('\n'),
        }];
      });
    },
  };
}
