/**
 * Canonical MiniMax provider URL constants.
 *
 * Pattern: L#NN-YYY v3 SEPARATE-FILE N=28 (D46 cycle 28).
 *
 * Source: extracted from inline URL literals in:
 *   - apps/forge/src/minimax/manager.ts (MINIMAX_BASE_URL was inline at L2)
 *   - apps/forge/src/llm/runtime-model.ts (was inline at L70-74 — 4 URL literals)
 *
 * Three URL constants cover the canonical host variants:
 *   - MINIMAX_HOST:               bare host (no path); used as profile.baseUrl equality check
 *   - MINIMAX_BASE_URL:           the default REST API root (used by minimax/manager.ts)
 *   - MINIMAX_ANTHROPIC_URL:      the Anthropic-compatible gateway root (used by llm/runtime-model.ts)
 */

/** Bare MiniMax host (no path). Used by llm/runtime-model.ts to detect the default profile.baseUrl. */
export const MINIMAX_HOST = 'https://api.minimax.io';

/** Default MiniMax REST API root. Used by minimax/manager.ts for non-Anthropic calls. */
export const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';

/** MiniMax Anthropic-compatible gateway root. Used by llm/runtime-model.ts for Anthropic-shaped calls. */
export const MINIMAX_ANTHROPIC_URL = 'https://api.minimax.io/anthropic/v1';
