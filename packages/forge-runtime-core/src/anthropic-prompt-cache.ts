import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

type AnthropicProviderOptions = {
  cacheControl?: { type: string; ttl: string };
};

type ProviderOptions = {
  anthropic?: AnthropicProviderOptions;
  [key: string]: unknown;
};

type MessageLike = {
  role?: string;
  content?: string | unknown[];
  providerOptions?: ProviderOptions;
};

const promptCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
    const prompt = [...params.prompt] as MessageLike[];

    if (prompt.length <= 1) {
      return params;
    }

    // Cache ALL messages except the last one (latest step output)
    const lastIndex = prompt.length - 1;

    for (let index = 0; index < lastIndex; index++) {
      const message = prompt[index];

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

      // Cast lastPart to properly typed object
      const part = lastPart as MessageLike;
      if (part.providerOptions?.anthropic?.cacheControl) {
        continue;
      }

      const existingProviderOptions = part.providerOptions ?? {};
      const existingAnthropic = existingProviderOptions.anthropic ?? {};

      content[content.length - 1] = {
        ...part,
        providerOptions: {
          ...existingProviderOptions,
          anthropic: {
            ...existingAnthropic,
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