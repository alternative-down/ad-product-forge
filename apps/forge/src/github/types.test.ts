import { describe, expect, it } from 'vitest';
import {
  githubAppManifestPermissionsSchema,
  githubAppManifestEventsSchema,
  githubAppManifestConfigSchema,
  githubAppPendingCredentialsSchema,
  githubAppCreatedCredentialsSchema,
  githubAppActiveCredentialsSchema,
  githubAppCredentialsSchema,
} from './types';

describe('githubAppManifestPermissionsSchema', () => {
  it('parses a valid permissions object', () => {
    const result = githubAppManifestPermissionsSchema.parse({
      administration: true,
      contents: true,
      issues: false,
      metadata: true,
      organization_projects: false,
      pull_requests: true,
      repository_projects: false,
      workflows: false,
    });
    expect(result.administration).toBe(true);
    expect(result.workflows).toBe(false);
  });

  it('throws when a field is missing', () => {
    expect(() =>
      githubAppManifestPermissionsSchema.parse({ contents: true }),
    )
  });

  it('throws when a field has wrong type', () => {
    expect(() =>
      githubAppManifestPermissionsSchema.parse({
        administration: 'yes',
        contents: false,
        issues: true,
        metadata: false,
        organization_projects: false,
        pull_requests: false,
        repository_projects: false,
        workflows: false,
      }),
    )
  });

  it('allows extra fields by default', () => {
    expect(() =>
      githubAppManifestPermissionsSchema.parse({
        administration: false,
        contents: false,
        issues: false,
        metadata: false,
        organization_projects: false,
        pull_requests: false,
        repository_projects: false,
        workflows: false,
        extra: true,
      }),
    )
  });
});

describe('githubAppManifestEventsSchema', () => {
  it('parses a valid events object', () => {
    const result = githubAppManifestEventsSchema.parse({
      push: true,
      pull_request: true,
      pull_request_review: false,
      issues: true,
      issue_comment: false,
      repository: false,
      workflow_run: true,
    });
    expect(result.push).toBe(true);
    expect(result.workflow_run).toBe(true);
  });

  it('throws when a field is missing', () => {
    expect(() =>
      githubAppManifestEventsSchema.parse({ push: true }),
    )
  });

  it('throws when a field is not boolean', () => {
    expect(() =>
      githubAppManifestEventsSchema.parse({
        push: false,
        pull_request: false,
        pull_request_review: false,
        issues: false,
        issue_comment: 0,
        repository: false,
        workflow_run: false,
      }),
    )
  });
});

describe('githubAppManifestConfigSchema', () => {
  const validPermissions = {
    administration: true,
    contents: true,
    issues: false,
    metadata: true,
    organization_projects: false,
    pull_requests: false,
    repository_projects: false,
    workflows: false,
  };
  const validEvents = {
    push: true,
    pull_request: false,
    pull_request_review: false,
    issues: true,
    issue_comment: false,
    repository: false,
    workflow_run: false,
  };

  it('parses a valid config', () => {
    const result = githubAppManifestConfigSchema.parse({
      permissions: validPermissions,
      events: validEvents,
    });
    expect(result.permissions.administration).toBe(true);
    expect(result.events.issues).toBe(true);
  });

  it('throws when permissions is missing', () => {
    expect(() =>
      githubAppManifestConfigSchema.parse({ events: validEvents }),
    )
  });

  it('throws when events is invalid', () => {
    expect(() =>
      githubAppManifestConfigSchema.parse({
        permissions: validPermissions,
        events: { push: 'yes' },
      }),
    )
  });
});

describe('githubAppPendingCredentialsSchema', () => {
  it('parses valid pending credentials', () => {
    const result = githubAppPendingCredentialsSchema.parse({
      status: 'pending',
      state: 'installation-123',
      appName: 'My App',
      manifestConfig: {
        permissions: { administration: true, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
        events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
      createdAt: 1710000000000,
    });
    expect(result.status).toBe('pending');
    expect(result.appName).toBe('My App');
  });

  it('throws when status is not literal "pending"', () => {
    expect(() =>
      githubAppPendingCredentialsSchema.parse({
        status: 'active',
        state: 'x',
        appName: 'x',
        manifestConfig: {
          permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
          events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
        },
        createdAt: 1710000000000,
      }),
    )
  });

  it('throws when createdAt is not an integer', () => {
    expect(() =>
      githubAppPendingCredentialsSchema.parse({
        status: 'pending',
        state: 'x',
        appName: 'x',
        manifestConfig: {
          permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
          events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
        },
        createdAt: 1710000000000.5,
      }),
    )
  });
});

describe('githubAppCreatedCredentialsSchema', () => {
  it('parses valid created credentials', () => {
    const result = githubAppCreatedCredentialsSchema.parse({
      status: 'created',
      appId: 123456,
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      webhookSecret: 'whsec_test',
      appSlug: 'my-app',
      appName: 'My App',
      manifestConfig: {
        permissions: { administration: true, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
        events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
      createdAt: 1710000000000,
    });
    expect(result.status).toBe('created');
    expect(result.appId).toBe(123456);
  });

  it('throws when status is not "created"', () => {
    expect(() =>
      githubAppCreatedCredentialsSchema.parse({
        status: 'pending',
        appId: 123456,
        privateKey: 'key',
        webhookSecret: 'sec',
        appSlug: 'app',
        appName: 'App',
        manifestConfig: {
          permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
          events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
        },
        createdAt: 1710000000000,
      }),
    )
  });
});

describe('githubAppActiveCredentialsSchema', () => {
  it('parses valid active credentials', () => {
    const result = githubAppActiveCredentialsSchema.parse({
      status: 'active',
      appId: 789,
      privateKey: 'key',
      webhookSecret: 'sec',
      installationId: 99999,
      appSlug: 'prod-app',
      appName: 'Production App',
      manifestConfig: {
        permissions: { administration: false, contents: true, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
        events: { push: true, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
      createdAt: 1710000000000,
    });
    expect(result.status).toBe('active');
    expect(result.installationId).toBe(99999);
  });

  it('throws when installationId is missing', () => {
    expect(() =>
      githubAppActiveCredentialsSchema.parse({
        status: 'active',
        appId: 789,
        privateKey: 'key',
        webhookSecret: 'sec',
        appSlug: 'app',
        appName: 'App',
        manifestConfig: {
          permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
          events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
        },
        createdAt: 1710000000000,
      }),
    )
  });
});

describe('githubAppCredentialsSchema - discriminated union', () => {
  it('accepts pending status', () => {
    const result = githubAppCredentialsSchema.parse({
      status: 'pending',
      state: 'x',
      appName: 'x',
      manifestConfig: {
        permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
        events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
      createdAt: 1710000000000,
    });
    expect(result.status).toBe('pending');
  });

  it('accepts created status', () => {
    const result = githubAppCredentialsSchema.parse({
      status: 'created',
      appId: 1,
      privateKey: 'key',
      webhookSecret: 'sec',
      appSlug: 'app',
      appName: 'App',
      manifestConfig: {
        permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
        events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
      createdAt: 1710000000000,
    });
    expect(result.status).toBe('created');
  });

  it('accepts active status', () => {
    const result = githubAppCredentialsSchema.parse({
      status: 'active',
      appId: 1,
      privateKey: 'key',
      webhookSecret: 'sec',
      installationId: 1,
      appSlug: 'app',
      appName: 'App',
      manifestConfig: {
        permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
        events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
      createdAt: 1710000000000,
    });
    expect(result.status).toBe('active');
  });

  it('rejects unknown status', () => {
    expect(() =>
      githubAppCredentialsSchema.parse({
        status: 'unknown',
        state: 'x',
        appName: 'x',
        manifestConfig: {
          permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
          events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
        },
        createdAt: 1710000000000,
      }),
    )
  });
});
