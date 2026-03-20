import { z } from 'zod';

export const githubAppPendingCredentialsSchema = z.object({
  status: z.literal('pending'),
  state: z.string(),
  appName: z.string(),
  createdAt: z.number().int(),
});

export const githubAppCreatedCredentialsSchema = z.object({
  status: z.literal('created'),
  appId: z.number().int(),
  privateKey: z.string(),
  webhookSecret: z.string(),
  appSlug: z.string(),
  appName: z.string(),
  createdAt: z.number().int(),
});

export const githubAppActiveCredentialsSchema = z.object({
  status: z.literal('active'),
  appId: z.number().int(),
  privateKey: z.string(),
  webhookSecret: z.string(),
  installationId: z.number().int(),
  appSlug: z.string(),
  appName: z.string(),
  createdAt: z.number().int(),
});

export const githubAppCredentialsSchema = z.discriminatedUnion('status', [
  githubAppPendingCredentialsSchema,
  githubAppCreatedCredentialsSchema,
  githubAppActiveCredentialsSchema,
]);

export type GitHubAppCredentials = z.infer<typeof githubAppCredentialsSchema>;
