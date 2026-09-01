/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

const promptCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  // eslint-disable-next-line @typescript-eslint/require-await
  transformParams: async ({ params }) => {
    const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
    const prompt = [...params.prompt] as Array<Record<string, unknown>>;

    if (prompt.length <= 1) {
      return params;
    }

    // One breakpoint on the stable prefix caches every preceding message.
    // Marking every message exceeds Anthropic's four-breakpoint limit and makes
    // request preparation scale with the complete conversation history.
    const stablePrefixIndex = prompt.length - 2;
    const stablePrefixMessage = prompt[stablePrefixIndex] as {
      providerOptions?: Record<string, Record<string, unknown>>;
    };

    if (!stablePrefixMessage.providerOptions?.anthropic?.cacheControl) {
      prompt[stablePrefixIndex] = {
        ...stablePrefixMessage,
        providerOptions: {
          ...stablePrefixMessage.providerOptions,
          anthropic: {
            ...stablePrefixMessage.providerOptions?.anthropic,
            cacheControl,
          },
        },
      };
    }

    // Mutate params.prompt to point to our modified shallow copy
    params.prompt = prompt as typeof params.prompt;
    return params;
  },
};

export function wrapAnthropicPromptCacheModel(
  model: Parameters<typeof wrapLanguageModel>[0]['model'],
): ReturnType<typeof wrapLanguageModel> {
  return wrapLanguageModel({
    model,
    middleware: promptCacheMiddleware,
  });
}
