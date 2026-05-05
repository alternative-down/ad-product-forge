import { z } from 'zod';

// fallow-ignore-next-line unused-export
export const discordProviderDeleteSignalSchema = z.object({
  token: z.string(),
});
