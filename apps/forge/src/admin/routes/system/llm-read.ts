/**
 * LLM Admin Routes - #1588
 * Fragmented routes for /admin/system/llm/sub-resources
 *
 * Replaces the monolithic GET /admin/system/llm (which fetches 3 queries in parallel).
 * Each route fetches only the data it needs.
 */

import { jsonResponse } from '../helpers';

interface LlmReadModel {
  listLlmProfiles: () => Promise<unknown>;
  getLlmDefaults: () => Promise<unknown>;
  listLlmPrices: () => Promise<unknown>;
}

/**
 * Register fragmented LLM routes on the HTTP server.
 */
export function registerLlmReadRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: (req: unknown) => unknown }) => void },
  readModel: LlmReadModel,
) {
  // GET /admin/system/llm/profiles
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm/profiles',
    handler: async () => jsonResponse(await readModel.listLlmProfiles()),
  });

  // GET /admin/system/llm/defaults
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm/defaults',
    handler: async () => jsonResponse(await readModel.getLlmDefaults()),
  });

  // GET /admin/system/llm/prices
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm/prices',
    handler: async () => jsonResponse(await readModel.listLlmPrices()),
  });
}