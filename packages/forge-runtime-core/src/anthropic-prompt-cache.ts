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

      // Skip if already has cache control at message level
      if (message.providerOptions?.anthropic?.cacheControl) {
        continue;
      }

      if (typeof message.content === 'string') {
        // For string content: add providerOptions at message level
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

      // For array content: add providerOptions at the LAST PART level
      const content = [...message.content];
      const lastPart = content[content.length - 1];

      if (typeof lastPart === 'string') {
        continue;
      }

      // Skip if last part already has cache control
      if ((lastPart as Record<string, unknown>).providerOptions?.anthropic?.cacheControl) {
        continue;
      }

      content[content.length - 1] = {
        ...lastPart,
        providerOptions: {
          ...(lastPart as Record<string, unknown>).providerOptions,
          anthropic: {
            ...((lastPart as Record<string, unknown>).providerOptions as Record<string, unknown>)?.anthropic,
            cacheControl,
          },
        },
      };

      prompt[index] = {
        ...message,
        content,
      };
    }

    return {
      ...params,
      prompt: prompt as typeof params.prompt,
    };
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
