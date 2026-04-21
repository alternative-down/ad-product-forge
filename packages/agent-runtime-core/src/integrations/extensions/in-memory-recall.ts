import { createTextStepContextEntry } from '../../core/step-context.js';
import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput, StepContextEntry, StepRecord } from '../../core/types.js';

export type RecallDocument = {
  id: string;
  text: string;
  score?: number;
};

export type InMemoryRecallPluginOptions = {
  name?: string;
  maxItems?: number;
  dedupeWindow?: number;
  buildQuery(context: {
    pendingInputs: RuntimeInput[];
    steps: StepRecord[];
  }): string | null;
  retrieve(context: {
    query: string;
    pendingInputs: RuntimeInput[];
    steps: StepRecord[];
  }): Promise<RecallDocument[]> | RecallDocument[];
  renderDocument?(document: RecallDocument, index: number): StepContextEntry;
};

export function createInMemoryRecallPlugin(
  options: InMemoryRecallPluginOptions,
): RuntimePlugin {
  const maxItems = options.maxItems ?? 3;
  const dedupeWindow = options.dedupeWindow ?? 10;
  const recentDocumentIds: string[] = [];

  return {
    name: options.name ?? 'in-memory-recall',
    async provideContext(context) {
      const query = options.buildQuery({
        pendingInputs: context.pendingInputs,
        steps: context.steps,
      });

      if (!query) {
        return [];
      }

      const recalledDocuments = await options.retrieve({
        query,
        pendingInputs: context.pendingInputs,
        steps: context.steps,
      });

      const unseenDocuments = recalledDocuments
        .filter((document) => !recentDocumentIds.includes(document.id))
        .slice(0, maxItems);

      if (unseenDocuments.length === 0) {
        return [];
      }

      for (const document of unseenDocuments) {
        recentDocumentIds.push(document.id);
      }

      while (recentDocumentIds.length > dedupeWindow) {
        recentDocumentIds.shift();
      }

      return unseenDocuments.map((document, index) => {
        if (options.renderDocument) {
          return options.renderDocument(document, index);
        }

        const scoreText = typeof document.score === 'number'
          ? ` - score ${document.score.toFixed(2)}`
          : '';

        return createTextStepContextEntry({
          id: `recall:${document.id}`,
          kind: 'recall',
          title: `Recall ${index + 1}${scoreText}`,
          text: document.text,
        });
      });
    },
  };
}
