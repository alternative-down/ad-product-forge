/**
 * GitHub App Ops — low-level GitHub App authentication and Octokit helpers.
 *
 * Part of #5318 — split createGitHubAppManager.
 *
 * Provides:
 * - getInstallationToken: get short-lived installation token from GitHub App
 * - createGitHubApp: build the App instance for webhook delivery
 * - createInstallationOctokit: build Octokit for a specific installation
 */
import { App } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import type { Octokit } from 'octokit';
import type { GitHubAppCredentials } from '../types';

export interface GitHubAppOps {
  getInstallationToken: (
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) => Promise<{ token: string; expiresAt: string }>;
  createGitHubApp: (
    credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>,
  ) => App;
  createInstallationOctokit: (
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) => Promise<Octokit>;
}

export function createGitHubAppOps(): GitHubAppOps {
  async function getInstallationToken(
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) {
    const auth = createAppAuth({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      installationId: credentials.installationId,
    });
    const token = await auth({ type: 'installation' });

    return {
      token: token.token,
      expiresAt: token.expiresAt,
    };
  }

  function createGitHubApp(
    credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>,
  ) {
    return new App({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhooks: {
        secret: credentials.webhookSecret,
      },
    });
  }

  async function createInstallationOctokit(
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) {
    const app = createGitHubApp(credentials);
    return await app.getInstallationOctokit(credentials.installationId);
  }

  return {
    getInstallationToken,
    createGitHubApp,
    createInstallationOctokit,
  };
}
