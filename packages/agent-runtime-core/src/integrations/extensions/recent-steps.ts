import type { RuntimePlugin } from '../../core/plugins.js';
import type { StepContentSegment } from '../../core/types.js';

export type RecentStepsPluginOptions = {
  name?: string;
  maxSteps?: number;
  includeKinds?: StepContentSegment['kind'][];
};

export function createRecentStepsPlugin(options: RecentStepsPluginOptions = {}): RuntimePlugin {
  const includeKinds = options.includeKinds ?? ['message', 'reasoning'];
  const maxSteps = options.maxSteps ?? 3;

  return {
    name: options.name ?? 'recent-steps',
    provideContext(context) {
      const recentSteps = context.steps.slice(-maxSteps);

      return recentSteps.flatMap((step) => {
        const visibleSegments = step.modelResponse.segments
          .filter((segment) => includeKinds.includes(segment.kind));

        if (visibleSegments.length === 0) {
          return [];
        }

        return [{
          id: `recent-step:${step.id}`,
          kind: 'recent-step',
          title: `Recent step ${step.stepNumber}`,
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
