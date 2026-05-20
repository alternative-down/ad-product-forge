import { createTextStepContextEntry } from '../../core/step-context.js';
import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput, StepContextEntry, StepRecord } from '../../core/types.js';
import type { LongTermMemoryRecall } from '../memory/long-term-memory.js';

export type LongTermRecallPluginOptions = {
  memory: LongTermMemoryRecall;
  topK?: number;
  threshold?: number;
  dedupeWindow?: number;
  buildQuery(context: { pendingInputs: RuntimeInput[]; steps: StepRecord[] }): string | null;
  renderResult?(
    input: {
      id: string;
      text: string;
      score: number;
    },
    index: number,
  ): StepContextEntry;
};

export function createLongTermRecallPlugin(options: LongTermRecallPluginOptions): RuntimePlugin {
  const recentIds: string[] = [];

  return {
    name: 'long-term-recall',
    async provideContext(context) {
      const query = options.buildQuery({
        pendingInputs: context.pendingInputs,
        steps: context.steps,
      });

      if (!query) {
        return [];
      }

      const recalled = await options.memory.recall({
        query,
        topK: options.topK,
        threshold: options.threshold,
      });
      const unseen = recalled.filter((result) => !recentIds.includes(result.id));

      if (unseen.length === 0) {
        return [];
      }

      for (const result of unseen) {
        recentIds.push(result.id);
      }

      while (recentIds.length > (options.dedupeWindow ?? 20)) {
        recentIds.shift();
      }

      return unseen.map((result, index) => {
        if (options.renderResult) {
          return options.renderResult(result, index);
        }

        return createTextStepContextEntry({
          id: `ltm:${result.id}`,
          kind: 'long-term-memory',
          title: `Long-Term Memory ${index + 1} - score ${result.score.toFixed(2)}`,
          text: result.text,
        });
      });
    },
  };
}
