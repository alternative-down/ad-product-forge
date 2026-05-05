import { z } from 'zod';

const discordProviderDeleteSignalSchema = z.object({
  token: z.string(),
});
