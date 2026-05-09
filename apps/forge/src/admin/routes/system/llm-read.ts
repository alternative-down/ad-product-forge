// fallow-ignore-file unused-file  // #1588/#1589 fragment routes, loaded at runtime

/**
 * LLM Admin Routes - #1588
 * Fragmented routes for /admin/system/llm/sub-resources
 *
 * Replaces the monolithic GET /admin/system/llm (which fetches 3 queries in parallel).
 * Each route fetches only the data it needs.
 */

import { jsonResponse } from '../index';

interface LlmReadModel {
  listLlmProfiles: () => Promise<unknown>;
  getLlmDefaults: () => Promise<unknown>;
  listLlmPrices: () => Promise<unknown>;
}

/**
 * Register fragmented LLM routes on the HTTP server.
 */
