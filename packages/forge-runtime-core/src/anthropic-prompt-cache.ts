import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

const promptCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
    const prompt = [...params.prompt] as Array<Record<string, unknown>>;
    const firstSystemIndex = prompt.findIndex((message) => message.role === 'system');
    const lastUserIndex = findLastPromptIndex(prompt, (message) => message.role === 'user');
    const lastMessageIndex = prompt.length - 1;
    const indicesToCache = [
      firstSystemIndex,
      lastUserIndex,
      lastMessageIndex,
    ].filter((value, index, list) =>
      value >= 0 && list.indexOf(value) === index,
    );

    for (const index of indicesToCache) {
      if (index < 0) {
        continue;
      }

      const message = prompt[index] as {
        content?: unknown;
        providerOptions?: Record<string, Record<string, unknown>>;
      };

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

function findLastPromptIndex(
  prompt: Array<Record<string, unknown>>,
  predicate: (message: Record<string, unknown>) => boolean,
) {
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    if (predicate(prompt[index])) {
      return index;
    }
  }

  return -1;
}
