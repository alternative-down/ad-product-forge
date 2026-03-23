import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';

const SEARCH_RESULT_LIMIT = 10;

export function createWebTools(allowedToolIds?: Set<string> | null) {
  const tools: Record<string, Tool<unknown, unknown>> = {};

  if (hasToolPermission(allowedToolIds, 'search_web')) {
    tools.search_web = createTool({
      id: 'search_web',
      description: 'Search the public web and return the top matching results.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(SEARCH_RESULT_LIMIT).optional(),
      }),
      execute: async (input) => {
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`, {
          headers: {
            'user-agent': 'ad-product-forge/1.0',
          },
        });

        if (!response.ok) {
          throw new Error(`Web search failed with status ${response.status}`);
        }

        const html = await response.text();
        const results = extractSearchResults(html, input.limit ?? 5);

        return {
          query: input.query,
          results,
        };
      },
    });
  }

  return tools;
}

function extractSearchResults(html: string, limit: number) {
  const results = [];
  const resultPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null = resultPattern.exec(html);

  while (match && results.length < limit) {
    const url = decodeHtml(match[1]);
    const title = cleanText(match[2]);

    if (url && title) {
      results.push({ title, url });
    }

    match = resultPattern.exec(html);
  }

  return results;
}
function cleanText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
