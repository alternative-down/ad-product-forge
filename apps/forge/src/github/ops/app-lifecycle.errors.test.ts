/**
 * Tests for Pattern L typed Errors in github/ops/app-lifecycle module (D51 #6502 batch 20).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (agentId) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/github/ops/errors.ts.
 */

import type { GitHubAppManifestConfig } from '../types';
import { describe, expect, it } from 'vitest';

import { createAppLifecycleOps } from './app-lifecycle';
import {
  GithubAppAlreadyExistsError,
  GithubAppDoesNotExistError,
  GithubIntegrationNotConfiguredError,
} from './errors';

const validManifestConfig: GitHubAppManifestConfig = {
  permissions: {
    administration: false,
    contents: true,
    issues: true,
    metadata: true,
    organization_projects: false,
    pull_requests: true,
    repository_projects: false,
    workflows: false,
  },
  events: {
    push: false,
    pull_request: true,
    pull_request_review: false,
    issues: true,
    issue_comment: false,
    repository: false,
    workflow_run: false,
  },
};

describe('app-lifecycle — Pattern L typed Errors (D51 #6502 batch 20)', () => {
  const mockGithubApp = {} as never;
  const makeCtx = (
    getGitHubConfig: () => Promise<unknown> = () => Promise.resolve({ organization: 'org' }),
  ) =>
    ({
      config: {
        integrations: { getGitHubConfig },
        db: { query: { agents: { findFirst: () => Promise.resolve(null) } } },
        createId: () => 'test-id',
      },
      opsRouting: {
        registerAgentRoutes: () => undefined,
        buildProvisioning: () => undefined,
      },
      saveCredentials: () => Promise.resolve(undefined),
      DEFAULT_GITHUB_APP_MANIFEST_CONFIG: validManifestConfig,
    }) as never;

  it('throws GithubIntegrationNotConfiguredError with code discriminator when GitHub config is missing', async () => {
    const ctx = makeCtx(() => Promise.resolve(null));
    const credentialsMock = {
      getCredentials: () => Promise.resolve(null),
    } as never;
    const ops = createAppLifecycleOps(ctx, {
      githubApp: mockGithubApp,
      credentials: credentialsMock,
    });
    let captured: unknown;
    try {
      await ops.getGlobalConfig();
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(GithubIntegrationNotConfiguredError);
    expect((captured as GithubIntegrationNotConfiguredError).code).toBe(
      'GITHUB_INTEGRATION_NOT_CONFIGURED',
    );
    expect((captured as Error).message).toContain('not configured');
  });

  it('throws GithubAppAlreadyExistsError with code discriminator and agentId when credentials exist', async () => {
    const activeCredentials = {
      status: 'active',
      state: 'active-id',
      appName: 'forge-test-agent',
      manifestConfig: validManifestConfig,
    };
    const ctx = makeCtx();
    const credentialsMock = {
      getCredentials: () => Promise.resolve(activeCredentials),
    } as never;
    const ops = createAppLifecycleOps(ctx, {
      githubApp: mockGithubApp,
      credentials: credentialsMock,
    });
    let captured: unknown;
    try {
      await ops.createAgentApp({ agentId: 'a-1', agentName: 'Agent One' });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(GithubAppAlreadyExistsError);
    expect((captured as GithubAppAlreadyExistsError).code).toBe('GITHUB_APP_ALREADY_EXISTS');
    expect((captured as GithubAppAlreadyExistsError).agentId).toBe('a-1');
    expect((captured as Error).message).toContain('already exists');
    expect((captured as Error).message).toContain('a-1');
  });

  it('throws GithubAppDoesNotExistError with code discriminator and agentId when no credentials', async () => {
    const ctx = makeCtx();
    const credentialsMock = {
      getCredentials: () => Promise.resolve(null),
    } as never;
    const ops = createAppLifecycleOps(ctx, {
      githubApp: mockGithubApp,
      credentials: credentialsMock,
    });
    let captured: unknown;
    try {
      await ops.updateAgentManifestConfig({
        agentId: 'a-2',
        manifestConfig: validManifestConfig,
      });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(GithubAppDoesNotExistError);
    expect((captured as GithubAppDoesNotExistError).code).toBe('GITHUB_APP_DOES_NOT_EXIST');
    expect((captured as GithubAppDoesNotExistError).agentId).toBe('a-2');
    expect((captured as Error).message).toContain('does not exist');
    expect((captured as Error).message).toContain('a-2');
  });
});
