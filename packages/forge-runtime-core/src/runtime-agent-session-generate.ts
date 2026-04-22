import type { RuntimeRunController } from 'agent-runtime-core/integrations';

import {
  dispatchRuntimeSessionFeedback,
  dispatchRuntimeSessionMessages,
} from './runtime-agent-session-messages.js';
import {
  createRuntimeAgentSessionIteration,
  resolveRuntimeAgentSessionContinuation,
} from './runtime-agent-session-iteration.js';
import { dispatchRuntimeProviderOptions } from './runtime-agent-session-provider-options-plugin.js';
import { dispatchRuntimeSystemInstruction } from './runtime-agent-session-system-plugin.js';
import type {
  CreateRuntimeAgentSessionOptions,
  RuntimeAgentSessionGenerateOptions,
  RuntimeAgentSessionGenerateMessage,
  RuntimeAgentSessionStepResult,
} from './runtime-agent-session.js';
import type { ForgeAgentRuntime } from './runtime.js';

export async function runRuntimeAgentSessionGenerate(input: {
  runtime: ForgeAgentRuntime;
  runController: RuntimeRunController;
  session: CreateRuntimeAgentSessionOptions;
  prompt: RuntimeAgentSessionGenerateMessage;
  options: RuntimeAgentSessionGenerateOptions;
}): Promise<{
  text: string;
  usage?: RuntimeAgentSessionStepResult['usage'];
}> {
  if (input.options.system?.trim()) {
    await dispatchRuntimeSystemInstruction({
      runtime: input.runtime.host.runtime,
      text: input.options.system.trim(),
    });
  }

  const promptMessages = typeof input.prompt === 'string'
    ? [{
      role: 'user' as const,
      content: input.prompt,
    }]
    : input.prompt;

  await dispatchRuntimeSessionMessages({
    bridge: input.runtime.bridge,
    threadId: input.session.threadId,
    agentId: input.session.agentId,
    messages: promptMessages,
  });

  let finalText = '';
  let finalUsage: RuntimeAgentSessionStepResult['usage'];

  await input.runController.run({
    maxSteps: input.options.maxSteps,
    signal: input.options.abortSignal,
    beforeStep: async ({ nextStepNumber }) => {
      if (input.options.providerOptions && Object.keys(input.options.providerOptions).length > 0) {
        await dispatchRuntimeProviderOptions({
          runtime: input.runtime.host.runtime,
          providerOptions: input.options.providerOptions,
        });
      }

      await input.options.prepareStep?.({
        stepNumber: nextStepNumber - 1,
      });
    },
    afterStep: async ({ latestStep }) => {
      const iteration = createRuntimeAgentSessionIteration({
        record: latestStep,
        runId: input.options.runId ?? input.session.threadId,
        threadId: input.session.threadId,
        resourceId: input.session.resourceId,
        agentId: input.session.agentId,
        agentName: input.session.agentName,
      });

      finalText = iteration.text;
      finalUsage = latestStep.modelUsage ?? undefined;
      await input.options.onStepFinish?.({
        usage: latestStep.modelUsage ?? undefined,
      });
    },
    continueAfterStep: async ({ latestStep }) => {
      const iteration = createRuntimeAgentSessionIteration({
        record: latestStep,
        runId: input.options.runId ?? input.session.threadId,
        threadId: input.session.threadId,
        resourceId: input.session.resourceId,
        agentId: input.session.agentId,
        agentName: input.session.agentName,
      });
      const result = await resolveRuntimeAgentSessionContinuation({
        options: input.options,
        iteration,
      });

      if (result.feedback?.trim()) {
        await dispatchRuntimeSessionFeedback({
          bridge: input.runtime.bridge,
          threadId: input.session.threadId,
          agentId: input.session.agentId,
          text: result.feedback.trim(),
        });
      }

      return result.continue;
    },
  });

  return {
    text: finalText,
    usage: finalUsage,
  };
}
