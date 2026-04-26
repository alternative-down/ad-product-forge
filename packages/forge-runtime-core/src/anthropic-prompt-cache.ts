import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

const promptCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
    const prompt = [...params.prompt] as Array<Record<string, unknown>>;

    if (prompt.length <= 1) {
      return params;
    }

    // Cache ALL messages except the last one (latest step output)
    const lastIndex = prompt.length - 1;

    for (let index = 0; index < lastIndex; index++) {
      const message = prompt[index] as {
        content?: unknown;
        providerOptions?: Record<string, Record<string, unknown>>;
        role?: string;
      };

      // Skip if already has cache control
      if (message.providerOptions?.anthropic?.cacheControl) {
        continue;
      }

      if (typeof message.content === 'string') {
        prompt[index] = {
          ...message,
          providerOptions: {
            ...message.providerOptions,
            anthropic: { ...message.providerOptions?.anthropic, cacheControl },
          },
        };
        continue;
      }

      if (!Array.isArray(message.content) || message.content.length === 0) {
        continue;
      }

      const content = [...message.content];
      const lastPart = content[content.length - 1];

      if (typeof lastPart === 'string') {
        continue;
      }

      content[content.length - 1] = {
        ...lastPart,
        providerOptions: {
          ...lastPart.providerOptions,
          anthropic: { ...lastPart.providerOptions?.anthropic, cacheControl },
        },
      };

      prompt[index] = {
        ...message,
        content,
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
