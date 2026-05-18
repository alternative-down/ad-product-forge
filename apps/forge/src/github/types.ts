import { z } from 'zod';

export const githubAppManifestPermissionsSchema = z.object({
  administration: z.boolean(),
  contents: z.boolean(),
  issues: z.boolean(),
  metadata: z.boolean(),
  organization_projects: z.boolean(),
  pull_requests: z.boolean(),
  repository_projects: z.boolean(),
  workflows: z.boolean(),
});

export const githubAppManifestEventsSchema = z.object({
  push: z.boolean(),
  pull_request: z.boolean(),
  pull_request_review: z.boolean(),
  issues: z.boolean(),
  issue_comment: z.boolean(),
  repository: z.boolean(),
  workflow_run: z.boolean(),
});

export const githubAppManifestConfigSchema = z.object({
  permissions: githubAppManifestPermissionsSchema,
  events: githubAppManifestEventsSchema,
});

export const githubAppPendingCredentialsSchema = z.object({
  status: z.literal('pending'),
  state: z.string(),
  appName: z.string(),
  manifestConfig: githubAppManifestConfigSchema,
  createdAt: z.number().int(),
});

export const githubAppCreatedCredentialsSchema = z.object({
  status: z.literal('created'),
  appId: z.number().int(),
  privateKey: z.string(),
  webhookSecret: z.string(),
  appSlug: z.string(),
  appName: z.string(),
  manifestConfig: githubAppManifestConfigSchema,
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
  manifestConfig: githubAppManifestConfigSchema,
  createdAt: z.number().int(),
});

export const githubAppCredentialsSchema = z.discriminatedUnion('status', [
  githubAppPendingCredentialsSchema,
  githubAppCreatedCredentialsSchema,
  githubAppActiveCredentialsSchema,
]);

export type GitHubAppCredentials = z.infer<typeof githubAppCredentialsSchema>;
export type GitHubAppManifestConfig = z.infer<typeof githubAppManifestConfigSchema>;

export type GitHubAppProvisioning = {
  agentId: string;
  status: string;
  registrationUrl: string;
  installUrl?: string;
  manifestConfig?: object;
};
