import { countTokens } from '../../token-counter.js';
import type { RuntimePlugin } from '../../core/plugins.js';
import type { ActionResult, RuntimeInput, StepContextEntry, StepRecord } from '../../core/types.js';
import type { OperationalMemory } from '../memory/operational-memory.js';

export type OperationalMemoryPluginOptions = {
  memory: OperationalMemory;
  renderCurrentStepInputs?: boolean;
};

export function createOperationalMemoryPlugin(
  options: OperationalMemoryPluginOptions,
): RuntimePlugin {
  return {
    name: 'operational-memory',
    async onDispatch(context) {
      await options.memory.append({
        id: `input:${context.input.id}`,
        source: 'input',
        text: renderInput(context.input),
        createdAt: context.input.receivedAt,
        units: countTokens(stringifyValue(context.input.payload)),
      });
      await options.memory.consolidate();
    },
    async provideContext(context) {
      const memoryContext = await options.memory.renderContext();

      if (options.renderCurrentStepInputs === true) {
        return memoryContext;
      }

      return memoryContext.filter((entry) => !isCurrentInputEcho(entry, context.pendingInputs));
    },
    async onAfterStep(context) {
      const responseText = renderStepResponse(context.record);

      if (responseText) {
        await options.memory.append({
          id: `response:${context.record.id}`,
          source: 'response',
          text: responseText,
          createdAt: context.record.finishedAt,
          units: countTokens(responseText),
        });
      }

      for (const actionResult of context.record.actionResults) {
        const renderedAction = renderActionResult(actionResult);

        await options.memory.append({
          id: `action:${context.record.id}:${actionResult.name}`,
          source: 'action-result',
          text: renderedAction,
          createdAt: context.record.finishedAt,
          units: countTokens(renderedAction),
        });
      }

      await options.memory.consolidate();
    },
  };
}

function renderInput(input: RuntimeInput) {
  return `Input type: ${input.type}\n${stringifyValue(input.payload)}`;
}

function renderStepResponse(record: StepRecord) {
  return record.modelResponse.segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join('\n');
}

function renderActionResult(actionResult: ActionResult) {
  return `Action: ${actionResult.name}\nInput: ${
    stringifyValue(actionResult.input)
  }\nOutput: ${stringifyValue(actionResult.output)}`;
}

function isCurrentInputEcho(entry: StepContextEntry, pendingInputs: RuntimeInput[]) {
  return pendingInputs.some((input) => entry.id === `input:${input.id}`);
}


function stringifyValue(value: unknown) {
  const rendered = JSON.stringify(value, null, 2);
  return rendered ?? 'null';
}
