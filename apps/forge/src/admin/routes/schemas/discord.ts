import { z } from 'zod';

export const discordProviderDeleteSignalSchema = z.object({
  token: z.string(),
});
