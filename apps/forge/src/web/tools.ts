import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';

const SEARCH_RESULT_LIMIT = 10;
const DEFAULT_FETCH_CHAR_LIMIT = 12_000;
const MAX_FETCH_CHAR_LIMIT = 30_000;

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

  if (hasToolPermission(allowedToolIds, 'fetch_web')) {
    tools.fetch_web = createTool({
      id: 'fetch_web',
      description: 'Fetch one web page and return readable text content.',
      inputSchema: z.object({
        url: z.string().url(),
        maxChars: z.number().int().positive().max(MAX_FETCH_CHAR_LIMIT).optional(),
      }),
      execute: async (input) => {
        const response = await fetch(input.url, {
          redirect: 'follow',
          headers: {
            'user-agent': 'ad-product-forge/1.0',
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          throw new Error(`Web fetch failed with status ${response.status}`);
        }

        const html = await response.text();
        const content = htmlToText(html).slice(0, input.maxChars ?? DEFAULT_FETCH_CHAR_LIMIT);

        return {
          url: input.url,
          title: extractTitle(html),
          content,
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

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : null;
}

function htmlToText(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
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
