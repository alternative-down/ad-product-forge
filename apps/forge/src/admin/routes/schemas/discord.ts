import { z } from 'zod';

/**
 * Discord-specific provider schemas.
 *
 * `discordProviderDeleteSignalSchema` is used by the agent-provider/upsert route
 * to detect "deletion" calls: when the frontend sends a `token: ''` (empty string)
 * for a discord provider, the route treats it as a delete request rather than
 * an upsert. See `provider-mcp.ts` for the route handler logic.
 */
export const discordProviderDeleteSignalSchema = z.object({
  token: z.string(),
});
