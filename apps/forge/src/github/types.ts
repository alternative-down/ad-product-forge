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

// Response shape for POST /app-manifests/{code}/conversions.
// Used by handleManifestCallback in apps/forge/src/github/ops/routing.ts.
// Only the three fields consumed by the install flow are validated; the
// GitHub API returns additional fields (client_id, owner, html_url) that
// zod strips by default. See:
// https://docs.github.com/en/rest/apps/apps#create-a-github-app-from-a-manifest
export const githubAppManifestConversionResponseSchema = z.object({
  id: z.number().int(),
  pem: z.string(),
  webhook_secret: z.string(),
});

// Subset of the GET /app response shape consumed by handleManifestCallback
// in apps/forge/src/github/ops/routing.ts. slug is optional because some
// GitHub Apps (e.g. user-level apps) may not have one. See:
// https://docs.github.com/en/rest/apps/apps#get-the-authenticated-app
export const githubAppInfoResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string().optional(),
});

export type GitHubAppCredentials = z.infer<typeof githubAppCredentialsSchema>;
export type GitHubAppManifestConfig = z.infer<typeof githubAppManifestConfigSchema>;
// Unexported in E9 — inferred types from LIVE schemas (githubAppManifestConversionResponseSchema, githubAppInfoResponseSchema) but zero consumers of the inferred types; consumers parse the schema directly (see github/ops/routing.ts).
type GitHubAppManifestConversionResponse = z.infer<
  typeof githubAppManifestConversionResponseSchema
>;
type GitHubAppInfoResponse = z.infer<typeof githubAppInfoResponseSchema>;

export type GitHubAppProvisioning = {
  agentId: string;
  status: GitHubAppCredentials['status'];
  registrationUrl: string;
  installUrl?: string;
  manifestConfig: GitHubAppManifestConfig;
};
